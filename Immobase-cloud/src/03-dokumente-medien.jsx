// ─── DOCUMENTS MANAGER ───────────────────────────────────────────────────────
const STOCKWERK_OPTIONS = ["EG","1. OG","2. OG","3. OG","4. OG","5. OG","6. OG"];

const APT_CATEGORIES = ["Hauptmietvertrag","Verlängerungsvertrag","Anfangsmietzinsformular","Einzahlungsschein","Kautionsversicherung","Übergabeprotokoll","Sonstige"];
const TENANT_CATEGORIES = ["Untermietvertrag (unterzeichnet)","Verlängerung (unterzeichnet)","Anfangsmietzinsformular (unterzeichnet)","Einzahlungsschein","Kautionsbestätigung","Pass / Ausweis","Betreibungsregister-Auszug","Übergabeprotokoll","Drittmeldebestätigung (Einzug)","Drittmeldebestätigung (Auszug)","Sonstige"];

// Required categories that should be tracked in the checklist (excluding "Sonstige")
const APT_REQUIRED = ["Hauptmietvertrag","Anfangsmietzinsformular","Einzahlungsschein","Kautionsversicherung","Übergabeprotokoll"];
const TENANT_REQUIRED = ["Untermietvertrag (unterzeichnet)","Anfangsmietzinsformular (unterzeichnet)","Kautionsbestätigung","Pass / Ausweis","Betreibungsregister-Auszug"];
const APPLICANT_REQUIRED = ["Pass / Ausweis","Betreibungsregister-Auszug"];

// Bewerber/Applicant: gleiche Kategorien wie Tenant aber ohne Übergabeprotokoll/Kautionsbestätigung
const APPLICANT_CATEGORIES = ["Untermietvertrag (unterzeichnet)","Anfangsmietzinsformular (unterzeichnet)","Pass / Ausweis","Betreibungsregister-Auszug","Bewerbungsformular","Sonstige"];

function DocumentChecklist({entityType, entityId, documents, onJumpToDocs, tenant, onJumpToDrittmeldung}){
  const docs = (documents||[]).filter(d => d.entity_type === entityType && d.entity_id === entityId);
  const categories = entityType === "apartment" ? APT_REQUIRED : (entityType === "applicant" ? APPLICANT_REQUIRED : TENANT_REQUIRED);
  const present = new Set(docs.map(d => d.category));
  const extra = [];
  if (entityType === "tenant" && tenant) {
    extra.push({ label:"Drittmeldung Einzug", ok: (tenant.drittmeldungStatus==="gemeldet") || present.has("Drittmeldebestätigung (Einzug)"), jump:onJumpToDrittmeldung });
    const ausD = (typeof parseD==="function") ? parseD(tenant.auszug) : null;
    const ausgezogen = (tenant.status==="archiviert") || (ausD && ausD <= new Date());
    if (ausgezogen) extra.push({ label:"Drittmeldung Auszug", ok: (tenant.drittmeldungAuszugStatus==="gemeldet") || present.has("Drittmeldebestätigung (Auszug)"), jump:onJumpToDrittmeldung });
  }
  const completed = categories.filter(c => present.has(c)).length + extra.filter(e=>e.ok).length;
  const total = categories.length + extra.length;
  const allDone = completed === total;
  
  return (
    <div style={{background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:8,padding:"14px 16px",marginTop:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",fontWeight:500}}>Dokumente-Checkliste</div>
        <div style={{fontSize:11,fontWeight:600,color:allDone?"#5a6e4a":completed>0?"#b8843e":"#8a8174",letterSpacing:".05em"}}>
          {completed}/{total} {allDone?"✓ vollständig":"erfasst"}
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
        {categories.map(c => {
          const ok = present.has(c);
          return (
            <div key={c} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",background:ok?"#e8eadb":"#ffffff",border:`1px solid ${ok?"#c5cda8":"#e8e3d8"}`,borderRadius:6,fontSize:11.5}}>
              <span style={{fontSize:14,color:ok?"#5a6e4a":"#c5b896",flexShrink:0}}>{ok?"✓":"○"}</span>
              <span style={{flex:1,color:ok?"#3d4f2f":"#8a8174",fontWeight:ok?500:400}}>{c}</span>
            </div>
          );
        })}
        {extra.map(e => (
          <div key={e.label} onClick={e.jump||undefined} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",background:e.ok?"#e8eadb":"#ffffff",border:`1px solid ${e.ok?"#c5cda8":"#e8e3d8"}`,borderRadius:6,fontSize:11.5,cursor:e.jump?"pointer":"default"}}>
            <span style={{fontSize:14,color:e.ok?"#5a6e4a":"#c5b896",flexShrink:0}}>{e.ok?"✓":"○"}</span>
            <span style={{flex:1,color:e.ok?"#3d4f2f":"#8a8174",fontWeight:e.ok?500:400}}>{e.label}</span>
          </div>
        ))}
      </div>
      {onJumpToDocs && (
        <div style={{marginTop:10,textAlign:"right"}}>
          <button className="btn btn-g btn-sm" onClick={onJumpToDocs}>📎 Zu Dokumenten →</button>
        </div>
      )}
    </div>
  );
}

function fileSize(bytes) {
  if (!bytes) return "-";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + " KB";
  return (bytes/(1024*1024)).toFixed(1) + " MB";
}

function fileIcon(mime, filename) {
  const ext = (filename||"").split('.').pop().toLowerCase();
  if (mime?.includes("pdf") || ext === "pdf") return "📄";
  if (mime?.includes("image") || ["jpg","jpeg","png","gif","webp"].includes(ext)) return "🖼️";
  if (mime?.includes("word") || ["doc","docx"].includes(ext)) return "📝";
  if (mime?.includes("excel") || mime?.includes("sheet") || ["xls","xlsx","csv"].includes(ext)) return "📊";
  return "📎";
}

// ─── PdfPreview: render first page of a PDF as inline image ─────────────
const _pdfPreviewCache = new Map();
function _ensurePdfJsAdmin(){
  return new Promise((resolve, reject) => {
    if (window.pdfjsLib){
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      resolve(window.pdfjsLib);
      return;
    }
    let tries = 0;
    const check = setInterval(() => {
      if (window.pdfjsLib){
        clearInterval(check);
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        resolve(window.pdfjsLib);
      } else if (++tries > 50){
        clearInterval(check);
        reject(new Error("pdf.js not loaded"));
      }
    }, 100);
  });
}
async function _renderPdfPreviewAdmin(url){
  if (_pdfPreviewCache.has(url)) return _pdfPreviewCache.get(url);
  const p = (async () => {
    const pdfjs = await _ensurePdfJsAdmin();
    const pdf = await pdfjs.getDocument(url).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL("image/png");
  })();
  _pdfPreviewCache.set(url, p);
  return p;
}
function PdfPreview({url}){
  const [src, setSrc] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let cancelled = false;
    _renderPdfPreviewAdmin(url).then(d => { if (!cancelled) setSrc(d); }).catch(e => { console.warn(e); if (!cancelled) setErr(true); });
    return () => { cancelled = true; };
  }, [url]);
  if (err) return <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",color:"#8a8174",fontSize:11,gap:2}}><span style={{fontSize:28}}>📄</span><span style={{fontWeight:600,letterSpacing:".04em"}}>PDF</span></div>;
  if (!src) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:"#8a8174",fontSize:11,fontStyle:"italic"}}>📄 lädt…</div>;
  return <img src={src} alt="PDF Vorschau" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>;
}

// ─── MediaManager: Fotos + Matterport URL ───────────────────────────────
function MediaManager({apt, editApt, rooms}){
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [mp, setMp] = useState(apt.matterportUrl || "");
  const [besch, setBesch] = useState(apt.beschreibung || "");
  const [beschSaving, setBeschSaving] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [insTitel,setInsTitel]=useState(apt.inserat_titel||""); const [insText,setInsText]=useState(apt.inserat_text||""); const [insBusy,setInsBusy]=useState(false); const [insCopied,setInsCopied]=useState(""); const [savingWeb,setSavingWeb]=useState(false); const [savedWeb,setSavedWeb]=useState(false);
  const savedInsRef = useRef({t:apt.inserat_titel||"", x:apt.inserat_text||""});
  useEffect(()=>{ setInsTitel(apt.inserat_titel||""); setInsText(apt.inserat_text||""); savedInsRef.current={t:apt.inserat_titel||"",x:apt.inserat_text||""}; }, [apt.id]);
  useEffect(()=>{
    const t=setTimeout(()=>{
      if(insTitel!==savedInsRef.current.t || insText!==savedInsRef.current.x){
        savedInsRef.current={t:insTitel,x:insText};
        editApt(apt.id,{inserat_titel:insTitel, inserat_text:insText}).catch(function(){});
      }
    }, 900);
    return ()=>clearTimeout(t);
  }, [insTitel, insText]);
  async function saveBesch(){ setBeschSaving(true); try{ await editApt(apt.id,{beschreibung: besch}); }catch(err){ toast("Speichern fehlgeschlagen", "error"); } setBeschSaving(false); }
  async function generateBesch(){ setGenBusy(true); try{ const {data,error}=await supabase.functions.invoke("generate-beschreibung",{body:{adresse:apt.adresse,plz:apt.plz,ort:apt.ort,zimmer:apt.zimmer,vermietungsart:apt.vermietungsart||"zimmer"}}); if(error) throw error; if(data&&data.text){ setBesch(data.text); } else { alert("Kein Text erhalten. Ist der Anthropic-Schlüssel hinterlegt?"); } }catch(err){ alert("Automatische Generierung nicht möglich: "+(err.message||err)+"\n\n(Benötigt den Anthropic-API-Schlüssel in app_config.)"); } setGenBusy(false); }
  async function generateInserat(){ setInsBusy(true); try{
    const aptRooms = (rooms||[]).filter(r=> r.aptId===apt.id && r.ausschreibOverride!=="nicht" && (r.ausschreibOverride==="ausschreiben" || !r.occupied));
    const payloadRooms = aptRooms.map(r=>({ groesse:r.groesse||"", qm:r.qm||null, miete:r.miete||null, balkon:!!r.balkon, moebliert:!!r.moebliert, verfuegbarAb:r.mieter_auszug||apt.mietbeginn||"" }));
    const body={ typ:apt.type||"", adresse:apt.adresse||"", plz:apt.plz||"", ort:apt.ort||"", stockwerk:apt.stockwerk||"", wgGroesse:apt.zimmer||"", mietbeginn:apt.mietbeginn||"", mietende:apt.mietende||"", kaution:apt.kaution||null, kautionType:apt.kautionType||apt.kaution_type||"", miete:apt.miete||null, wgZimmer:(rooms||[]).filter(r=>r.aptId===apt.id).length, rooms:payloadRooms, vermietungsart:apt.vermietungsart||"zimmer", flaeche:apt.flaeche||null, merkmale:Array.isArray(apt.merkmale)?apt.merkmale:[] };
    const {data,error}=await supabase.functions.invoke("generate-inserat",{body}); if(error) throw error;
    if(data&&(data.titel||data.beschreibung)){ setInsTitel(data.titel||""); setInsText(data.beschreibung||""); }
    else { alert(data&&data.error ? data.error : "Kein Text erhalten."); }
  }catch(err){ alert("Generierung nicht möglich: "+(err.message||err)); } setInsBusy(false); }
  function copyIns(txt,which){ try{ navigator.clipboard.writeText(txt||""); setInsCopied(which); setTimeout(()=>setInsCopied(""),1500); }catch(e){} }
  async function saveInseratToWeb(){
    if(!insText){ alert("Zuerst Inseratstext generieren."); return; }
    setSavingWeb(true);
    try{ await editApt(apt.id,{beschreibung:insText}); setSavedWeb(true); setTimeout(()=>setSavedWeb(false),2500); }
    catch(err){ toast("Speichern fehlgeschlagen", "error"); }
    setSavingWeb(false);
  }
  const [vidUp, setVidUp] = useState(false);
  async function uploadVideo(e){ const f=e.target.files&&e.target.files[0]; if(!f) return; if(f.size>500*1024*1024){ alert("Video zu gross (max. 500 MB)."); e.target.value=""; return; } setVidUp(true); try{ const ext=(f.name.split(".").pop()||"mp4").toLowerCase(); const path=`apartments/${apt.id}/video_${Date.now()}.${ext}`; const {error}=await supabase.storage.from("assets").upload(path,f,{contentType:f.type||"video/mp4",upsert:false}); if(error) throw error; if(apt.videoPath){ try{ await supabase.storage.from("assets").remove([apt.videoPath]); }catch(_){} } await editApt(apt.id,{videoPath:path}); }catch(err){ toast("Video-Upload fehlgeschlagen", "error"); } setVidUp(false); e.target.value=""; }
  async function removeVideo(){ if(!confirm("Video entfernen?")) return; setVidUp(true); try{ if(apt.videoPath){ try{ await supabase.storage.from("assets").remove([apt.videoPath]); }catch(_){} } await editApt(apt.id,{videoPath:null}); }catch(err){ toast("Entfernen fehlgeschlagen", "error"); } setVidUp(false); }
  const [mpSaving, setMpSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [aiIdx, setAiIdx] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [aiReview, setAiReview] = useState(null);
  const CAT_ORDER = ["aussen","balkon","__room","kueche","wohnzimmer","bad","eingang","sonstiges"];
  function catRank(cat){ if(!cat) return 90; const c=String(cat); if(c==="grundriss") return 100; if(c.indexOf("room:")===0) return CAT_ORDER.indexOf("__room"); const i=CAT_ORDER.indexOf(c); return i>=0?i:80; }
  function roomKey(cat){ const id=String(cat||"").replace(/^room:/,""); const n=parseInt(id.split("-")[1],10); return isNaN(n)?9999:n; }
  async function editPhotoAI(idx, mode){
    const p = photos[idx];
    if(!p || !p.path) return;
    setAiIdx(idx);
    try{
      const {data,error}=await supabase.functions.invoke("edit-image",{body:{path:p.path, apartment_id:apt.id, mode:mode||"leeren"}});
      if(error) throw error;
      if(data&&data.error) throw new Error(data.error);
      if(data&&data.path){ setAiReview({idx, origPath:p.path, aiPath:data.path, category:p.category||null, sort_order:p.sort_order}); }
      else { alert("Keine bearbeitete Version erhalten."); }
    }catch(err){ alert("KI-Bearbeitung nicht moeglich: "+(err.message||err)); }
    setAiIdx(null);
  }
  async function confirmAi(){
    const rv=aiReview; if(!rv) return;
    try{
      const next=photos.map((ph,ix)=>ix===rv.idx?{...ph,hidden:true}:ph);
      next.push({path:rv.aiPath, sort_order:(rv.sort_order!=null?rv.sort_order:photos.length), category:rv.category||null, hidden:false, edited:true});
      await editApt(apt.id,{photos:next});
    }catch(err){ toast("Speichern fehlgeschlagen", "error"); }
    setAiReview(null);
  }
  async function rejectAi(){
    const rv=aiReview; if(!rv) return;
    try{ await supabase.storage.from("assets").remove([rv.aiPath]); }catch(e){}
    setAiReview(null);
  }
  const fileInputRef = React.useRef(null);
  const photos = apt.photos || [];
  async function importFromListing(){
    let url = null;
    try {
      const { data: dl } = await supabase.from("pipeline").select("url").eq("won_apartment_id", apt.id).not("url","is",null).limit(1);
      if (dl && dl[0] && dl[0].url) url = dl[0].url;
    } catch (e) { /* Fallback auf manuelle Eingabe */ }
    if (url) {
      if (!confirm("Bilder vom verkn\u00fcpften Inserat holen?\n\n" + url + "\n\nSie werden dieser Wohnung als Medien hinzugef\u00fcgt.")) return;
    } else {
      url = window.prompt("Link zum Flatfox-Inserat einf\u00fcgen. Die Bilder werden geholt und dieser Wohnung als Medien hinzugef\u00fcgt:", "");
      if (!url) return;
    }
    if(!/flatfox\.ch/i.test(url)){ alert("Bitte einen flatfox.ch-Link einf\u00fcgen."); return; }
    setImporting(true);
    try{
      const { data, error } = await supabase.functions.invoke("import-listing-images", { body: { url: url.trim(), apartment_id: apt.id } });
      if(error) throw error;
      if(data && data.error) throw new Error(data.error);
      const paths = (data && data.paths) || [];
      const meta = (data && data.meta) || {};
      const fields = {};
      const filled = [];
      // Eckdaten aus dem Inserat nur in leere Felder übernehmen
      [["zimmer","zimmer","Zimmer"],["stockwerk","stockwerk","Stockwerk"],["mietbeginn","mietbeginn","Mietbeginn"],["mietende","mietende","befristet bis"],["miete","miete","Miete"],["beschreibung","beschreibung","Beschreibung"],["adresse","adresse","Adresse"],["plz","plz","PLZ"],["ort","ort","Ort"],["matterport_url","matterportUrl","3D-Tour"]].forEach(function(t){
        var mk=t[0], ak=t[1], lbl=t[2], cur=apt[ak];
        var empty=(cur===null||cur===undefined||cur==="");
        if(empty && meta[mk]!==undefined && meta[mk]!==null && meta[mk]!==""){ fields[ak]=meta[mk]; filled.push(lbl); }
      });
      // Bilder: keine Duplikate, wenn schon Inseratsbilder vorhanden sind
      var addedImgs=0;
      var hasFlatfox=(photos||[]).some(function(p){return String((p&&p.path)||"").indexOf("/flatfox_")>=0;});
      if(paths.length && (!hasFlatfox || confirm("Es sind bereits Inseratsbilder vorhanden. Bilder trotzdem erneut hinzufügen?"))){
        var start=photos.length;
        fields.photos=[...photos, ...paths.map(function(p,i){return { path:p, sort_order:start+i, category:null };})];
        addedImgs=paths.length;
      }
      if(!addedImgs && !filled.length){ alert("Nichts zu übernehmen: keine neuen Bilder und keine offenen Felder."); setImporting(false); return; }
      await editApt(apt.id, fields);
      alert("✓ Import abgeschlossen. "+addedImgs+" Bild(er)"+(filled.length?" und Angaben übernommen ("+filled.join(", ")+")":"")+". Ordne die Bilder unten den Kategorien zu.");
    }catch(e){ toast("Import fehlgeschlagen", "error"); }
    setImporting(false);
  }
  
  // Build category options: Apartment's rooms + fixed common categories
  const aptRooms = (rooms || []).filter(r => r.aptId === apt.id);
  const categoryOptions = [
    ...aptRooms.map(r => ({ value: `room:${r.id}`, label: `Zimmer ${r.id.split("-")[1] || r.id}` })),
    { value: "kueche", label: "Küche" },
    { value: "bad", label: "Bad / Badezimmer" },
    { value: "wohnzimmer", label: "Wohnzimmer" },
    { value: "balkon", label: "Balkon / Terrasse" },
    { value: "eingang", label: "Eingangsbereich" },
    { value: "aussen", label: "Aussenansicht" },
    { value: "grundriss", label: "📐 Grundriss" },
    { value: "sonstiges", label: "Sonstiges" },
  ];
  
  function categoryLabel(cat){
    if (!cat) return "";
    const opt = categoryOptions.find(o => o.value === cat);
    return opt ? opt.label : cat;
  }
  
  function publicUrl(path){
    return `${SUPABASE_URL}/storage/v1/object/public/assets/${path}`;
  }

  const safeName = (s)=> String(s||"").replace(/[^a-zA-Z0-9]+/g,"_").replace(/^_|_$/g,"") || "Wohnung";
  const fileExt = (path)=> ((path||"").split("?")[0].split(".").pop()||"jpg").toLowerCase();

  async function downloadPhoto(p, i){
    try {
      const res = await fetch(publicUrl(p.path));
      if(!res.ok) throw new Error("HTTP "+res.status);
      const blob = await res.blob();
      const fname = `${safeName(apt.adresse||apt.id)}_${p.category ? safeName(p.category) : "Foto"}_${i+1}.${fileExt(p.path)}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href=url; a.download=fname; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 1500);
    } catch(e){ toast("Download fehlgeschlagen", "error"); }
  }

  async function downloadAll(onlyVisible){
    if(!window.JSZip){ alert("Zip-Bibliothek noch nicht geladen, bitte kurz warten und erneut versuchen."); return; }
    let list = onlyVisible ? photos.filter(p=>!p.hidden) : photos.slice();
    list = list.map((p,i)=>({p,i})).sort((a,b)=>{const fv=(b.p.favorite?1:0)-(a.p.favorite?1:0);if(fv)return fv;const d=catRank(a.p.category)-catRank(b.p.category);if(d)return d;const ar=String(a.p.category||"").indexOf("room:")===0,br=String(b.p.category||"").indexOf("room:")===0;if(ar&&br){const rd=roomKey(a.p.category)-roomKey(b.p.category);if(rd)return rd;}return (a.p.sort_order||0)-(b.p.sort_order||0);}).map(x=>x.p);
    if(!list.length){ alert(onlyVisible ? "Keine publizierten Bilder vorhanden." : "Keine Bilder vorhanden."); return; }
    setZipping(true);
    try {
      const zip = new window.JSZip();
      for(let i=0;i<list.length;i++){
        const p = list[i];
        const res = await fetch(publicUrl(p.path));
        if(!res.ok) continue;
        const blob = await res.blob();
        zip.file(`${String(i+1).padStart(2,"0")}_${p.category ? safeName(p.category) : "Foto"}.${fileExt(p.path)}`, blob);
      }
      const content = await zip.generateAsync({type:"blob"});
      const url = URL.createObjectURL(content);
      const a = document.createElement("a"); a.href=url; a.download=`${safeName(apt.adresse||apt.id)}_${onlyVisible?"Publiziert":"Alle"}.zip`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 1500);
    } catch(e){ toast("Zip fehlgeschlagen", "error"); }
    setZipping(false);
  }
  
  async function resizeImageClient(file, maxDim){
    // Skip non-resizable formats
    const nameLow = file.name.toLowerCase();
    const isPdf = file.type === "application/pdf" || nameLow.endsWith(".pdf");
    const isSvg = file.type === "image/svg+xml" || nameLow.endsWith(".svg");
    const isHeic = nameLow.endsWith(".heic") || nameLow.endsWith(".heif") || file.type === "image/heic" || file.type === "image/heif";
    if (isPdf || isSvg || isHeic) return file;
    // Skip already-small files
    if (file.size < 400 * 1024) return file;
    return new Promise((resolve) => {
      const img = new Image();
      const objUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objUrl);
        const { width, height } = img;
        if (width <= maxDim && height <= maxDim) {
          resolve(file);
          return;
        }
        const scale = Math.min(maxDim / width, maxDim / height);
        const newW = Math.round(width * scale);
        const newH = Math.round(height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = newW;
        canvas.height = newH;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, newW, newH);
        canvas.toBlob((blob) => {
          if (!blob) { resolve(file); return; }
          // Use new file with .jpg extension
          const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
          const newFile = new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
          resolve(newFile);
        }, "image/jpeg", 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(objUrl); resolve(file); };
      img.src = objUrl;
    });
  }
  
  async function uploadBatch(files){
    if (!files || files.length === 0) return;
    setUploading(true);
    const errors = [];
    const uploaded = [];
    let totalSavedBytes = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        let file = files[i];
        const origSize = file.size;
        // Client-side resize: shrink to max 1600px before upload
        try {
          file = await resizeImageClient(file, 1600);
          if (file.size < origSize) totalSavedBytes += (origSize - file.size);
        } catch(e) { console.warn("Resize failed for", file.name, e); }
        const nameLow = file.name.toLowerCase();
        const isPdf = file.type === "application/pdf" || nameLow.endsWith(".pdf");
        const isHeic = nameLow.endsWith(".heic") || nameLow.endsWith(".heif") || file.type === "image/heic" || file.type === "image/heif";
        const isImage = file.type.startsWith("image/") || isHeic;
        if (!isImage && !isPdf){ errors.push(`${file.name}: Format nicht erlaubt (Bilder + PDF)`); continue; }
        // Generous 15 MB limit for everything
        if (file.size > 15 * 1024 * 1024){ errors.push(`${file.name}: zu groß (>15 MB)`); continue; }
        const ext = (file.name.split(".").pop() || (isPdf ? "pdf" : "jpg")).toLowerCase();
        const ts = Date.now() + "-" + Math.random().toString(36).substr(2,7) + "-" + i;
        const path = `apartments/${apt.id}/${ts}.${ext}`;
        try {
          // Use a safe content type — HEIC files may have empty file.type in some browsers
          let contentType = file.type;
          if (isPdf) contentType = "application/pdf";
          else if (isHeic && !contentType) contentType = "image/heic";
          else if (!contentType) contentType = "image/jpeg";
          const { error: upErr } = await supabase.storage.from("assets").upload(path, file, { contentType, upsert: false });
          if (upErr) { errors.push(`${file.name}: ${upErr.message}`); continue; }
          uploaded.push(path);
        } catch (e) {
          errors.push(`${file.name}: ${e.message || e}`);
        }
      }
      // Single DB update with ALL new photos appended; auto-tag PDFs as grundriss
      if (uploaded.length > 0) {
        const start = photos.length;
        const newEntries = uploaded.map((p, i) => ({
          path: p,
          sort_order: start + i,
          category: p.toLowerCase().endsWith(".pdf") ? "grundriss" : null,
        }));
        await editApt(apt.id, { photos: [...photos, ...newEntries] });
      }
      if (errors.length > 0) {
        alert((uploaded.length > 0 ? `${uploaded.length} Datei(en) hochgeladen.\n\n` : "") + `${errors.length} Fehler:\n${errors.join("\n")}`);
      } else if (uploaded.length > 0 && totalSavedBytes > 200 * 1024) {
        // Subtle success — only show savings if meaningful
        const mb = (totalSavedBytes / (1024 * 1024)).toFixed(1);
        console.log(`Saved ${mb} MB by resizing ${uploaded.length} image(s)`);
      }
    } finally {
      setUploading(false);
    }
  }
  
  async function handleFileSelect(e){
    const files = [...e.target.files];
    e.target.value = "";
    await uploadBatch(files);
  }
  
  function handleDragOver(e){ e.preventDefault(); e.stopPropagation(); setDragOver(true); }
  function handleDragLeave(e){ e.preventDefault(); e.stopPropagation(); setDragOver(false); }
  async function handleDrop(e){
    e.preventDefault(); e.stopPropagation(); setDragOver(false);
    const files = [...e.dataTransfer.files];
    await uploadBatch(files);
  }
  
  async function deletePhoto(idx){
    if (!confirm("Foto wirklich löschen?")) return;
    const p = photos[idx];
    try {
      // Datei nur loeschen, wenn keine andere Wohnung dasselbe Bild verwendet (z.B. kopierte Fotos)
      const { data: andere } = await supabase.from("apartments").select("id,photos").neq("id", apt.id);
      const geteilt = (andere||[]).some(a => (Array.isArray(a.photos)?a.photos:[]).some(x => x && x.path === p.path));
      if (!geteilt) await supabase.storage.from("assets").remove([p.path]);
    } catch(e){ console.warn("Storage delete failed:", e); }
    const nextPhotos = photos.filter((_,i) => i !== idx).map((p,i) => ({...p, sort_order: i}));
    await editApt(apt.id, { photos: nextPhotos });
  }
  
  async function movePhoto(idx, dir){
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= photos.length) return;
    const next = [...photos];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    const reindexed = next.map((p,i) => ({...p, sort_order: i}));
    await editApt(apt.id, { photos: reindexed });
  }
  
  async function changeCategory(idx, newCat){
    const nextPhotos = photos.map((p,i) => i === idx ? {...p, category: newCat || null} : p);
    await editApt(apt.id, { photos: nextPhotos });
  }
  
  async function toggleFavorite(idx){
    const istFav = !!(photos[idx] && photos[idx].favorite);
    const nextPhotos = photos.map((p,i) => ({...p, favorite: i === idx ? !istFav : false}));
    await editApt(apt.id, { photos: nextPhotos });
  }
  
  async function toggleHidden(idx){
    const nextPhotos = photos.map((p,i) => i === idx ? {...p, hidden: !p.hidden} : p);
    await editApt(apt.id, { photos: nextPhotos });
  }
  
  async function saveMatterport(){
    setMpSaving(true);
    try {
      const url = mp.trim();
      if (url && !url.startsWith("http")){ alert("URL muss mit http(s):// beginnen."); return; }
      await editApt(apt.id, { matterportUrl: url || null });
      alert("✓ Matterport URL gespeichert.");
    } catch(e){
      toast("Speichern fehlgeschlagen", "error");
    } finally {
      setMpSaving(false);
    }
  }
  
  return (
    <div>
      {/* ─── Fotos Upload (zuerst) ─── */}
      <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
        style={{background:dragOver?"#f5efe4":"#fefcf7",border:dragOver?"2px dashed #1a1a1a":"1px solid #e1d8c5",borderRadius:8,padding:"14px 16px",marginBottom:14,transition:"all .15s ease"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",fontWeight:500}}>📷 Medien hochladen</div>
          {photos.filter(p=>!p.category).length > 0 && <span style={{fontSize:10.5,color:"#b8843e",background:"#fdf7e8",padding:"3px 9px",borderRadius:10,fontWeight:600,border:"1px solid #e8d2a8"}}>{photos.filter(p=>!p.category).length} ohne Zuordnung</span>}
        </div>
        <div style={{fontSize:11,color:"#6a6258",marginBottom:10,lineHeight:1.5}}>1. Mehrere Fotos + PDF-Grundrisse gleichzeitig hochladen.<br/>2. Anschließend pro Datei unten Küche, Bad, Zimmer 1, Grundriss etc. zuordnen.</div>
        <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10}}>
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} disabled={uploading} multiple accept="image/*,.heic,.heif,.pdf,application/pdf" style={{display:"none"}}/>
          <button className="btn btn-p btn-sm" disabled={uploading} onClick={()=>fileInputRef.current?.click()} style={{flex:1}}>
            {uploading ? "⏳ Lädt…" : "📎 Mehrere Bilder gleichzeitig wählen"}
          </button>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10}}>
          <button className="btn btn-g btn-sm" disabled={importing||uploading} onClick={importFromListing} style={{flex:1}}>
            {importing ? "\u23f3 Importiere Bilder\u2026" : "Bilder von Inserat holen (Flatfox)"}
          </button>
        </div>
        <div style={{padding:"12px 14px",background:dragOver?"rgba(26,24,20,.06)":"transparent",border:dragOver?"1px dashed #1a1a1a":"1px dashed #c5b896",borderRadius:6,textAlign:"center",fontSize:11.5,color:dragOver?"#1a1a1a":"#8a8174",fontStyle:"italic",transition:"all .15s ease",pointerEvents:"none"}}>
          {dragOver ? "📥 Loslassen zum Hochladen" : "Bilder (JPG, PNG, HEIC, WebP) + PDF · max. 15 MB · Zuordnung pro Datei nach Upload"}
        </div>
      </div>
      
      {/* ─── Fotos Grid ─── */}
      {photos.length > 0 && (
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <span style={{fontSize:11,color:"#8a8174"}}>{photos.length} Datei{photos.length>1?"en":""}</span>
          <button onClick={()=>downloadAll(false)} disabled={zipping} style={{background:"none",border:"1px solid #d8c9a4",borderRadius:6,padding:"4px 10px",cursor:zipping?"default":"pointer",fontSize:11,color:"#1a1814"}}>{zipping ? "⏳ ZIP wird erstellt…" : "⬇ Alle als ZIP"}</button>
          <button onClick={()=>downloadAll(true)} disabled={zipping} title="Ohne verborgene Bilder" style={{background:"none",border:"1px solid #d8c9a4",borderRadius:6,padding:"4px 10px",cursor:zipping?"default":"pointer",fontSize:11,color:"#1a1814",marginLeft:6}}>⬇ Nur publizierte</button>
        </div>
      )}
      {lightbox && <div onClick={()=>setLightbox(null)} style={{position:"fixed",inset:0,background:"rgba(20,18,15,.92)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20,cursor:"zoom-out"}}><img src={lightbox} style={{maxWidth:"96%",maxHeight:"96%",objectFit:"contain",borderRadius:6,boxShadow:"0 10px 40px rgba(0,0,0,.5)"}}/></div>}
      {aiReview && (
        <div style={{position:"fixed",inset:0,background:"rgba(20,18,15,.93)",zIndex:10000,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20,gap:14}}>
          <div style={{color:"#fff",fontSize:14,fontWeight:600}}>KI-Vorschau: Möbel entfernt</div>
          <div style={{display:"flex",gap:16,flexWrap:"wrap",justifyContent:"center",maxWidth:"100%"}}>
            <div style={{textAlign:"center"}}>
              <div style={{color:"#c7bfae",fontSize:11,marginBottom:6,textTransform:"uppercase",letterSpacing:".12em"}}>Original</div>
              <img src={publicUrl(aiReview.origPath)} style={{maxWidth:"44vw",maxHeight:"62vh",objectFit:"contain",borderRadius:6,border:"1px solid rgba(255,255,255,.2)"}}/>
            </div>
            <div style={{textAlign:"center"}}>
              <div style={{color:"#c7bfae",fontSize:11,marginBottom:6,textTransform:"uppercase",letterSpacing:".12em"}}>Ohne Möbel (KI)</div>
              <img src={publicUrl(aiReview.aiPath)} style={{maxWidth:"44vw",maxHeight:"62vh",objectFit:"contain",borderRadius:6,border:"1px solid rgba(255,255,255,.2)"}}/>
            </div>
          </div>
          <div style={{display:"flex",gap:10,marginTop:4}}>
            <button className="btn btn-p btn-sm" onClick={confirmAi}>Übernehmen</button>
            <button className="btn btn-sm" style={{background:"#fff"}} onClick={rejectAi}>Verwerfen</button>
          </div>
          <div style={{color:"#9a9384",fontSize:11,maxWidth:540,textAlign:"center",lineHeight:1.4}}>Übernehmen verbirgt das Original und nutzt die KI-Version für die Ausschreibungen. Verwerfen löscht die KI-Version, das Original bleibt.</div>
        </div>
      )}
      {photos.length > 0 ? (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(min(200px, 100%), 1fr))",gap:10,marginBottom:24}}>
          {photos.map((p,i)=>({p,i})).sort((a,b)=>{var fv=(b.p.favorite?1:0)-(a.p.favorite?1:0);if(fv)return fv;var d=catRank(a.p.category)-catRank(b.p.category);if(d)return d;var ar=String(a.p.category||"").indexOf("room:")===0,br=String(b.p.category||"").indexOf("room:")===0;if(ar&&br){var rd=roomKey(a.p.category)-roomKey(b.p.category);if(rd)return rd;}return (a.p.sort_order||0)-(b.p.sort_order||0);}).map(({p,i}) => (
            <div key={p.path} style={{border:`1px solid ${p.category ? "#e1d8c5" : "#e8d2a8"}`,borderRadius:8,overflow:"hidden",background:"#fff",position:"relative",boxShadow: p.category ? "none" : "0 0 0 1px #fdf7e8 inset"}}>
              {p.path.toLowerCase().endsWith(".pdf") ? (
                <a href={publicUrl(p.path)} target="_blank" rel="noopener" title="PDF in neuem Tab öffnen" style={{display:"block",height:140,background:"#fafafa",borderBottom:"1px solid #e8e0cd"}}>
                  <PdfPreview url={publicUrl(p.path)}/>
                </a>
              ) : (
                <img onClick={()=>setLightbox(publicUrl(p.path))} src={publicUrl(p.path)} alt={`Foto ${i+1}`} style={{width:"100%",height:140,objectFit:"cover",display:"block",opacity:p.hidden?.35:1,cursor:"zoom-in"}}/>
              )}
              {p.favorite && <div style={{position:"absolute",top:6,right:6,background:"#a08864",color:"#fff",fontSize:9,fontWeight:700,padding:"3px 7px",borderRadius:5,letterSpacing:".03em"}}>★ Titelbild</div>}
              {p.hidden && <div style={{position:"absolute",top:6,left:6,background:"rgba(26,24,20,.85)",color:"#fff",fontSize:9,fontWeight:600,padding:"3px 7px",borderRadius:5,letterSpacing:".03em"}}>Nicht im Inserat</div>}
              <div style={{padding:"6px 8px",borderTop:"1px solid #e8e0cd",background:"#fafafa"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                  <span style={{fontSize:10,color:"#8a8174"}}>#{i+1}</span>
                  <div style={{display:"flex",gap:4}}>
                    <button onClick={()=>movePhoto(i,-1)} disabled={i===0} title="Nach oben" style={{background:"none",border:"1px solid #d8c9a4",borderRadius:4,padding:"2px 6px",cursor:i===0?"default":"pointer",opacity:i===0?.3:1,fontSize:11}}>↑</button>
                    <button onClick={()=>movePhoto(i,1)} disabled={i===photos.length-1} title="Nach unten" style={{background:"none",border:"1px solid #d8c9a4",borderRadius:4,padding:"2px 6px",cursor:i===photos.length-1?"default":"pointer",opacity:i===photos.length-1?.3:1,fontSize:11}}>↓</button>
                    <button onClick={()=>downloadPhoto(p,i)} title="Herunterladen" style={{background:"none",border:"1px solid #d8c9a4",borderRadius:4,padding:"2px 6px",cursor:"pointer",fontSize:11}}>⬇</button>
                    {!String(p.path).toLowerCase().endsWith(".pdf") && <button onClick={()=>editPhotoAI(i,"leeren")} disabled={aiIdx!==null} title="Möbel entfernen und aufräumen (KI)" style={{background:aiIdx===i?"#efe4cd":"none",border:"1px solid #d8c9a4",borderRadius:4,padding:"2px 6px",cursor:aiIdx!==null?"default":"pointer",fontSize:11,opacity:(aiIdx!==null&&aiIdx!==i)?.4:1}}>{aiIdx===i?"⏳":"✨"}</button>}
                    {!String(p.path).toLowerCase().endsWith(".pdf") && <button onClick={()=>toggleFavorite(i)} title={p.favorite?"Titelbild entfernen":"Als Titelbild festlegen (wird überall zuerst gezeigt)"} style={{background:p.favorite?"#efe4cd":"none",border:"1px solid #d8c9a4",borderRadius:4,padding:"2px 6px",cursor:"pointer",fontSize:11,color:p.favorite?"#a08864":"inherit"}}>{p.favorite?"★":"☆"}</button>}
                    <button onClick={()=>toggleHidden(i)} title={p.hidden?"Wieder im Inserat zeigen":"Im Inserat verbergen"} style={{background:p.hidden?"#efe4cd":"none",border:"1px solid #d8c9a4",borderRadius:4,padding:"2px 6px",cursor:"pointer",fontSize:11}}>{p.hidden?"🚫":"👁"}</button>
                    <button onClick={()=>deletePhoto(i)} title="Löschen" style={{background:"none",border:"1px solid #c08070",color:"#9b4a3e",borderRadius:4,padding:"2px 6px",cursor:"pointer",fontSize:11}}>×</button>
                  </div>
                </div>
                <select value={p.category||""} onChange={e=>changeCategory(i, e.target.value)} style={{width:"100%",fontSize:11,padding:"3px 5px",border:"1px solid #d8c9a4",borderRadius:4,background:"#fff",color:"#1a1814"}}>
                  <option value="">- keine Zuordnung -</option>
                  {categoryOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{textAlign:"center",padding:"32px 16px",color:"#8a8174",fontStyle:"italic",fontSize:13,background:"#fafafa",borderRadius:8,border:"1px dashed #d8c9a4",marginBottom:24}}>Noch keine Fotos. Lade welche hoch, sie erscheinen dann im Bewerbungsformular.</div>
      )}
      
{/* ─── Matterport URL (zuletzt) ─── */}
      <div style={{background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:8,padding:"14px 16px"}}>
        <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:10,fontWeight:500}}>🎥 Matterport Virtual Tour</div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <input className="fi" style={{flex:1,margin:0}} value={mp} onChange={e=>setMp(e.target.value)} placeholder="https://my.matterport.com/show/?m=xxxxx"/>
          <button className="btn btn-p btn-sm" disabled={mpSaving} onClick={saveMatterport}>{mpSaving ? "⏳" : "✓ Speichern"}</button>
        </div>
        {apt.matterportUrl && (
          <div style={{marginTop:10,borderRadius:6,overflow:"hidden",border:"1px solid #e1d8c5"}}>
            <iframe src={apt.matterportUrl} width="100%" height="320" frameBorder="0" allowFullScreen style={{display:"block"}} title="Matterport Preview"/>
          </div>
        )}
        <div style={{fontSize:10.5,color:"#8a8174",marginTop:8,fontStyle:"italic"}}>Diese 3D-Tour wird unter den Fotos im Bewerbungsformular angezeigt.</div>
      </div>
      <div style={{background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:8,padding:"14px 16px",marginTop:16}}>
        <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:10,fontWeight:500}}>🏷️ Flatfox-Inseratstext</div>
        <button className="btn btn-sm" disabled={insBusy} onClick={generateInserat}>{insBusy?"⏳ generiert …":"✨ Inseratstext generieren"}</button>
        {(insTitel||insText) && (
          <div style={{marginTop:12}}>
            <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".2em",marginBottom:4,fontWeight:500}}>Titel</div>
            <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
              <input className="fi" style={{flex:1,margin:0}} value={insTitel} onChange={e=>setInsTitel(e.target.value)}/>
              <button className="btn btn-sm" onClick={()=>copyIns(insTitel,"t")}>{insCopied==="t"?"✓ kopiert":"Kopieren"}</button>
            </div>
            <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".2em",margin:"12px 0 4px",fontWeight:500}}>Beschreibung</div>
            <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
              <textarea className="fi" style={{flex:1,minHeight:200,margin:0,resize:"vertical",lineHeight:1.5}} value={insText} onChange={e=>setInsText(e.target.value)}/>
              <button className="btn btn-sm" onClick={()=>copyIns(insText,"b")}>{insCopied==="b"?"✓ kopiert":"Kopieren"}</button>
            </div>
            <div style={{marginTop:10,display:"flex",gap:8,flexWrap:"wrap"}}>
              <button className="btn btn-sm" onClick={()=>copyIns((insTitel?insTitel+"\n\n":"")+(insText||""),"all")}>{insCopied==="all"?"✓ alles kopiert":"Alles kopieren"}</button>
              <button className="btn btn-p btn-sm" disabled={savingWeb||!insText} onClick={saveInseratToWeb}>{savedWeb?"✓ auf Website":(savingWeb?"speichert …":"Auf Website übernehmen")}</button>
            </div>
          </div>
        )}
        <div style={{fontSize:10.5,color:"#8a8174",marginTop:8,fontStyle:"italic"}}>Fertiger Text für Flatfox aus den Objekt- und Zimmerdaten. Wird automatisch gespeichert und bleibt erhalten, du kannst ihn jederzeit manuell bearbeiten. „Auf Website übernehmen" zeigt die Beschreibung auf der Wohnungsseite.</div>
      </div>
      <div style={{background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:8,padding:"14px 16px",marginTop:16}}>
        <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:10,fontWeight:500}}>🎬 Video-Rundgang</div>
        {apt.videoPath ? (
          <div>
            <video controls src={supabase.storage.from("assets").getPublicUrl(apt.videoPath).data.publicUrl} style={{width:"100%",borderRadius:6,border:"1px solid #e1d8c5",maxHeight:360,background:"#000"}} />
            <div style={{display:"flex",justifyContent:"flex-end",marginTop:8}}>
              <button className="btn btn-sm" disabled={vidUp} onClick={removeVideo} style={{color:"#9b4a3e"}}>{vidUp?"⏳":"Video entfernen"}</button>
            </div>
          </div>
        ) : (
          <label className="btn btn-p btn-sm" style={{cursor:vidUp?"wait":"pointer"}}>{vidUp?"⏳ lädt hoch …":"+ Video hochladen"}<input type="file" accept="video/*" onChange={uploadVideo} disabled={vidUp} style={{display:"none"}}/></label>
        )}
        <div style={{fontSize:10.5,color:"#8a8174",marginTop:8,fontStyle:"italic"}}>Wird im Inserat gezeigt, besonders wenn keine Matterport-Tour vorhanden ist. Empfohlen: kurzes Handy-Video, max. ca. 500 MB.</div>
      </div>
    </div>
  );
}

function DocumentsManager({entityType, entityId, documents, uploadDocument, getDocumentUrl, deleteDocument}){
  const [uploading, setUploading] = useState(false);
  const [selCategory, setSelCategory] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = React.useRef(null);
  const docs = (documents||[]).filter(d => d.entity_type === entityType && d.entity_id === entityId);
  const signedBases = new Set(docs.filter(d=>/\(unterzeichnet\)/i.test(d.category||"")).map(d=>(d.category||"").replace(/\s*\(unterzeichnet\)\s*/i,"").trim().toLowerCase()));
  const shownDocs = docs.filter(d => /\(unterzeichnet\)/i.test(d.category||"") || !signedBases.has((d.category||"").trim().toLowerCase()));
  const categories = entityType === "apartment" ? APT_CATEGORIES : (entityType === "applicant" ? APPLICANT_CATEGORIES : TENANT_CATEGORIES);
  
  async function uploadFile(file) {
    if (!file) return;
    if (!selCategory) { alert("Bitte zuerst eine Kategorie wählen."); return; }
    setUploading(true);
    try {
      await uploadDocument(entityType, entityId, selCategory, file);
      setSelCategory("");
    } catch (err) {
      toast("Upload fehlgeschlagen", "error");
      console.error(err);
    } finally {
      setUploading(false);
    }
  }
  
  async function handleFileSelect(e) {
    const files = [...e.target.files];
    if (files.length === 0) return;
    if (!selCategory) { alert("Bitte zuerst eine Kategorie wählen."); e.target.value = ""; return; }
    for (const file of files) {
      await uploadFile(file);
    }
    e.target.value = "";
  }
  
  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!selCategory) return;
    setDragOver(true);
  }
  
  function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }
  
  async function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (!selCategory) {
      alert("Bitte zuerst eine Kategorie wählen.");
      return;
    }
    const files = [...e.dataTransfer.files];
    for (const file of files) {
      await uploadFile(file);
    }
  }
  
  async function handleView(doc) {
    // Fenster sofort öffnen (sonst blockiert Safari auf dem iPhone das Popup nach dem Warten)
    const fenster = window.open("", "_blank");
    const url = await getDocumentUrl(doc.storage_path);
    if (url) { if (fenster) fenster.location.href = url; else window.location.href = url; }
    else { try { fenster && fenster.close(); } catch (_) {} alert("Dokument konnte nicht geöffnet werden. Bitte prüfe die Internetverbindung und versuche es nochmals."); }
  }
  
  async function handleDownload(doc) {
    const url = await getDocumentUrl(doc.storage_path);
    if (!url) { alert("Download nicht möglich."); return; }
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  
  async function handleDelete(doc) {
    if (!confirm(`Dokument "${doc.filename}" wirklich löschen?`)) return;
    try {
      await deleteDocument(doc);
    } catch (err) {
      toast("Löschen fehlgeschlagen", "error");
    }
  }
  
  return (
    <div>
      <div 
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          background: dragOver ? "#f5efe4" : "#fefcf7",
          border: dragOver ? "2px dashed #1a1a1a" : "1px solid #e1d8c5",
          borderRadius: 8,
          padding: "14px 16px",
          marginBottom: 14,
          transition: "all .15s ease"
        }}>
        <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:10,fontWeight:500}}>Neues Dokument hochladen</div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <select className="fi" style={{flex:1,margin:0}} value={selCategory} onChange={e=>setSelCategory(e.target.value)}>
            <option value="">- Kategorie wählen -</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} disabled={uploading||!selCategory} multiple style={{display:"none"}}/>
          <button className="btn btn-p btn-sm" disabled={uploading||!selCategory} onClick={()=>fileInputRef.current?.click()}>
            {uploading ? "⏳ Lädt…" : "📎 Datei wählen"}
          </button>
        </div>
        <div style={{
          marginTop:10,
          padding:"12px 14px",
          background: dragOver ? "rgba(26,24,20,.06)" : "transparent",
          border: dragOver ? "1px dashed #1a1a1a" : "1px dashed #c5b896",
          borderRadius:6,
          textAlign:"center",
          fontSize:11.5,
          color: dragOver ? "#1a1a1a" : "#8a8174",
          fontStyle:"italic",
          transition:"all .15s ease",
          pointerEvents:"none"
        }}>
          {dragOver 
            ? `🎯 Datei${" jetzt loslassen"}` 
            : selCategory 
              ? `↓ Oder Datei(en) hierher ziehen - Kategorie: ${selCategory}` 
              : "Erst Kategorie wählen, dann Datei(en) per Drag & Drop ablegen"}
        </div>
        <div style={{fontSize:10.5,color:"#8a8174",marginTop:6,fontStyle:"italic",textAlign:"center"}}>Max. 25 MB pro Datei · PDF, Bilder, Word, Excel</div>
      </div>
      
      {shownDocs.length === 0 ? (
        <div className="empty" style={{padding:"24px 16px"}}>Noch keine Dokumente hinterlegt</div>
      ) : (
        <div>
          {shownDocs.map(d => (
            <div key={d.id} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 14px",background:"#ffffff",border:"1px solid #e8e3d8",borderRadius:8,marginBottom:6}}>
              <span style={{fontSize:22}}>{fileIcon(d.mime_type, d.filename)}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,color:"#1a1814",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.filename}</div>
                <div style={{fontSize:11,color:"#8a8174",marginTop:2}}>
                  <span style={{background:"#f5efe4",padding:"1px 7px",borderRadius:4,marginRight:6,fontWeight:500}}>{d.category}</span>
                  {fileSize(d.file_size)} · {new Date(d.uploaded_at).toLocaleDateString("de-CH")}
                </div>
              </div>
              <div style={{display:"flex",gap:4}}>
                <button className="btn btn-g btn-sm" onClick={()=>handleView(d)} title="Anzeigen">👁</button>
                <button className="btn btn-g btn-sm" onClick={()=>handleDownload(d)} title="Herunterladen">⬇</button>
                <button className="btn btn-r btn-sm" onClick={()=>handleDelete(d)} title="Löschen">🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

