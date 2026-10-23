import sys, numpy as np
from PIL import Image
from scipy import ndimage
src,dst=sys.argv[1],sys.argv[2]
im=Image.open(src).convert('RGB')
sk=max(1.0,im.width/1150.0)
if sk>1.3: im=im.resize((int(im.width/sk),int(im.height/sk)),Image.LANCZOS)
a=np.array(im); g=np.array(im.convert("L"))
ink=g<225
S=np.ones((3,3))
def smallcomps(m,lim=18,dicht=0.0):
    lab,n=ndimage.label(m,structure=S); sl=ndimage.find_objects(lab)
    cnt=ndimage.sum(m,lab,range(1,n+1))
    sm=np.zeros(n+1,bool)
    for i,s in enumerate(sl):
        if s is None: continue
        h=s[0].stop-s[0].start; w=s[1].stop-s[1].start
        if max(h,w)<=lim and cnt[i]/(h*w)>=dicht: sm[i+1]=True
    return sm[lab]
# Schritt 1: freistehende Schrift
t1=smallcomps(ink,22)
# Schritt 2: Schrift, die eine gerade Linie beruehrt: Linien abziehen, dann kleine Reste
lh=ndimage.binary_opening(ink,structure=np.ones((1,30)))
lv=ndimage.binary_opening(ink,structure=np.ones((30,1)))
thick=ndimage.binary_opening(g<150,structure=np.ones((5,5)))
diag=np.zeros_like(ink)
for ang in (28,30,32,58,60,62,-28,-30,-32,-58,-60,-62):
    r=ndimage.rotate(ink.astype(np.uint8),ang,reshape=True,order=0)
    o=ndimage.binary_opening(r,structure=np.ones((1,30)))
    b=ndimage.rotate(o.astype(np.uint8),-ang,reshape=True,order=0)
    dy=(b.shape[0]-ink.shape[0])//2; dx=(b.shape[1]-ink.shape[1])//2
    diag|=b[dy:dy+ink.shape[0],dx:dx+ink.shape[1]].astype(bool)
diag&=ink
prot=lh|lv|thick|diag
rest=ink & ~ndimage.binary_dilation(prot,iterations=1) & ~t1
t2=smallcomps(rest,16,0.22)
# Schritt 3: Woerter per OCR (nur sichere, mit Buchstaben)
import pytesseract, re
H,W=g.shape; up=3
big=Image.fromarray(g).resize((W*up,H*up),Image.LANCZOS)
d=pytesseract.image_to_data(big,config='--psm 11',output_type=pytesseract.Output.DICT)
t3=np.zeros_like(ink)
for t,c,x,y,w,h in zip(d['text'],d['conf'],d['left'],d['top'],d['width'],d['height']):
    t=t.strip()
    if float(c)<60 or not re.search(r'[A-Za-zÄÖÜäöü]{1,}',t) or len(t)<2: continue
    x0,y0,x1,y1=x//up-2,y//up-2,(x+w)//up+3,(y+h)//up+3
    if x1-x0>200 or y1-y0>40: continue
    t3[max(0,y0):y1,max(0,x0):x1]=True
t3=t3 & ink & ~prot
text=t1|t2|t3
keep=ink & ~text
rm=ndimage.binary_dilation(text,iterations=6) & ~ndimage.binary_dilation(keep,iterations=1)
a[rm]=255
Image.fromarray(a).save(dst,quality=93)
