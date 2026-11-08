import subprocess, re, os, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
SP='/tmp/claude-0/-workspace-magazinegreen-projects/163eef4c-cfd5-53eb-8ce4-19557dda8d64/scratchpad'
F=SP+'/final'; E=SP+'/edit'
FF=open(F+'/ff.txt').read().strip()
W,H=1080,1920
# (file, in, dur, speed)
clips=[('S01',0.3,3.0,1),('S02',1.0,2.0,1),('S03',0.2,2.0,1),('S04',1.0,3.0,1),('S05',0.5,3.0,1),
('S06',0.5,2.25,1),('S06b',1.5,0.75,1),('S07',0.0,5.0,1.2),('S08',0.8,3.0,1),('S09',1.0,3.0,1),
('S10a',0.5,1.5,1),('S10b',0.3,2.5,1),('S11a',0.5,2.0,1),('S11b',1.0,11.0,1)]
parts=[]
for i,(n,a,d,sp) in enumerate(clips):
    out=f'{E}/p{i:02d}.mp4'
    vf=f"trim=start={a}:duration={d},setpts=(PTS-STARTPTS)*{sp},scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps=30,format=yuv420p"
    subprocess.run([FF,'-loglevel','error','-y','-i',f'{F}/{n}.mp4','-vf',vf,'-an','-c:v','libx264','-crf','18','-preset','medium',out],check=True)
    parts.append(out)
open(E+'/list.txt','w').write(''.join(f"file '{p}'\n" for p in parts))
subprocess.run([FF,'-loglevel','error','-y','-f','concat','-safe','0','-i',E+'/list.txt','-c','copy',E+'/silent_raw.mp4'],check=True)
# subtitles as png overlays
font=ImageFont.truetype('/root/.fonts/nsk-korean.ttf',54)
srt=open('/workspace/magazinegreen-projects/shorts/garden-waits/자막.srt',encoding='utf-8').read().strip().split('\n\n')
def ts(t):
    h,m,s=t.replace(',','.').split(':'); return int(h)*3600+int(m)*60+float(s)
subs=[]
for k,blk in enumerate(srt):
    L=blk.split('\n'); a,b=[ts(x.strip()) for x in L[1].split('-->')]; text=L[2:]
    img=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(img)
    big = k in (0,9)
    f=ImageFont.truetype('/root/.fonts/nsk-korean.ttf',70 if big else 54)
    if text==['CHANNEL GREEN']: f=ImageFont.truetype('/root/.fonts/nsk-korean.ttf',58)
    lh=int(f.size*1.55); y0=int(H*0.64)-(len(text)-1)*lh//2
    sh=Image.new('RGBA',(W,H),(0,0,0,0)); sd=ImageDraw.Draw(sh)
    for j,t in enumerate(text):
        tw=d.textlength(t,font=f); x=(W-tw)/2; y=y0+j*lh
        sd.text((x,y),t,font=f,fill=(0,0,0,90)); d.text((x,y),t,font=f,fill=(255,255,255,240))
    sh=sh.filter(ImageFilter.GaussianBlur(6))
    out=Image.alpha_composite(sh,img); p=f'{E}/sub{k:02d}.png'; out.save(p); subs.append((p,a,b))
inputs=['-i',E+'/silent_raw.mp4']; fc=''; last='0:v'
for k,(p,a,b) in enumerate(subs):
    inputs+=['-i',p]
    fade=f"[{k+1}:v]format=rgba,fade=t=in:st={a}:d=0.3:alpha=1,fade=t=out:st={max(a,b-0.3)}:d=0.3:alpha=1[s{k}];"
    fc+=fade+f"[{last}][s{k}]overlay=0:0:enable='between(t,{a},{b})'[v{k}];"; last=f'v{k}'
fc+=f"[{last}]fade=t=out:st=43.5:d=1.5[vout]"
subprocess.run([FF,'-loglevel','error','-y',*inputs,'-filter_complex',fc,'-map','[vout]','-c:v','libx264','-crf','20','-preset','medium','-pix_fmt','yuv420p','-movflags','+faststart',E+'/정원은아무것도하지않는다_가편집_자막.mp4'],check=True)
subprocess.run([FF,'-loglevel','error','-y','-i',E+'/silent_raw.mp4','-vf','fade=t=out:st=43.5:d=1.5','-c:v','libx264','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',E+'/정원은아무것도하지않는다_가편집_클린.mp4'],check=True)
print(subprocess.run([FF,'-i',E+'/정원은아무것도하지않는다_가편집_자막.mp4'],capture_output=True,text=True).stderr.split('Duration:')[1][:12])
