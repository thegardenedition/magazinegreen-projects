# 손스케치 풍 단면상세도 생성 (기획 AU 그림 1)
INK = "#3B342C"
RED = "#A8322A"
GRN = "#2F6B4F"

def sec(ox, kind):
    a = kind == "A"
    o = []
    g = lambda s: o.append(s)
    g(f'<g transform="translate({ox},0)">')
    # --- 수채 워시(채색) ---
    g('<g filter="url(#wash)">')
    g('<rect x="22" y="222" width="250" height="76" fill="#D9CBB3" opacity="0.55"/>')            # 원지반
    g('<polygon points="22,192 246,197 246,224 22,219" fill="#CFC9BC" opacity="0.8"/>')          # 잡석
    g('<polygon points="22,184 246,189 246,197 22,192" fill="#EBDDB6" opacity="0.9"/>')          # 모래
    g('<polygon points="22,170 246,175 246,189 22,184" fill="#BDB2A0" opacity="0.75"/>')         # 블록
    g('<rect x="272" y="183" width="156" height="115" fill="#C29A68" opacity="0.6"/>')           # 식재토
    g('<rect x="246" y="160" width="26" height="58" fill="#B9B4AA" opacity="0.85"/>')            # 경계석
    g('<rect x="240" y="218" width="40" height="18" fill="#CFCDC6" opacity="0.9"/>')             # 기초
    g('<ellipse cx="350" cy="148" rx="44" ry="31" fill="#5E8C66" opacity="0.75"/>')              # 수관
    g('<ellipse cx="362" cy="140" rx="26" ry="18" fill="#3F7553" opacity="0.6"/>')
    if a:
        g(f'<ellipse cx="355" cy="220" rx="56" ry="36" fill="{RED}" opacity="0.28"/>')
    g('</g>')
    # --- 연필 해칭(가는 선) ---
    g(f'<clipPath id="ce{kind}"><polygon points="22,219 246,224 272,224 272,298 22,298"/></clipPath>')
    g(f'<g clip-path="url(#ce{kind})"><g filter="url(#rough)" stroke="#5A4D3E" stroke-width="0.7" stroke-linecap="round" fill="none" opacity="0.7">')
    for x in range(-50, 272, 10):   # 원지반 사선
        g(f'<line x1="{x}" y1="298" x2="{x+76}" y2="222"/>')
    g('</g></g>')
    g('<g filter="url(#rough)" stroke="#5A4D3E" stroke-width="0.8" fill="none" opacity="0.8">')
    import random
    rnd = random.Random(7)
    for i in range(30):            # 잡석 자갈
        x = 28 + i * 7.3 + rnd.uniform(-1.5, 1.5); y = 200 + (x - 22) * 0.022 + rnd.uniform(0, 14)
        g(f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="{rnd.uniform(2.2,3.4):.1f}" ry="{rnd.uniform(1.5,2.4):.1f}"/>')
    g('</g>')
    g('<g fill="#5A4D3E" opacity="0.7">')
    for i in range(55):            # 모래 점
        x = 26 + i * 4.0 + rnd.uniform(-1, 1); y = 188.5 + (x - 22) * 0.022 + rnd.uniform(-1.6, 1.6)
        g(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="0.6"/>')
    for i in range(70):            # 식재토 점·짧은 획
        x = rnd.uniform(278, 424); y = rnd.uniform(190, 294)
        if (x - 355) ** 2 / 34 ** 2 + (y - 210) ** 2 / 22 ** 2 < 1.1: continue
        g(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="0.7"/>' if i % 2 else f'<rect x="{x:.1f}" y="{y:.1f}" width="3.5" height="0.8" transform="rotate({rnd.uniform(-20,20):.0f} {x:.1f} {y:.1f})"/>')
    g('</g>')
    g('<g filter="url(#rough)" stroke="#5A4D3E" stroke-width="0.7" fill="none" opacity="0.8">')
    for x in (246, 257, 268):      # 기초콘크리트 삼각
        g(f'<polyline points="{x},232 {x+3},224 {x+6},232"/>')
    g('</g>')
    # --- 윤곽선(잉크 펜, 두 번 그은 느낌) ---
    outline = f'''
      <polyline points="22,170 246,175"/><polyline points="22,184 246,189"/><polyline points="22,192 246,197"/><polyline points="22,219 246,224"/>
      <polyline points="16,168 251,175.1"/>
      <rect x="246" y="160" width="26" height="58"/><rect x="240" y="218" width="40" height="18"/>
      <polyline points="272,183 432,183"/><polyline points="269,183 278,183"/>
      <polyline points="22,165 16,200 27,214 15,246 26,266 21,300"/><polyline points="428,176 435,206 423,226 435,256 423,276 429,300"/>
      <polyline points="244,157 244,221"/><polyline points="274,157 274,212"/>
      {''.join(f'<line x1="{x}" y1="{170+(x-22)*0.0223:.1f}" x2="{x}" y2="{184+(x-22)*0.0223:.1f}"/>' for x in range(52, 246, 30))}
      <path d="M355,180 L355,188 M355,188 L340,215 M355,188 L370,217 M355,188 L356,229 M348,201 L330,224 M362,201 L381,226"/>
    '''
    g(f'<g filter="url(#rough)" stroke="{INK}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none">{outline}</g>')
    g(f'<g filter="url(#rough2)" stroke="{INK}" stroke-width="0.8" stroke-linecap="round" fill="none" opacity="0.55" transform="translate(0.8,0.6)">{outline}</g>')
    g(f'<ellipse cx="355" cy="210" rx="34" ry="22" fill="none" stroke="{INK}" stroke-width="1" stroke-dasharray="5 4" filter="url(#rough)"/>')
    g(f'<path d="M308,150 C305,120 335,110 352,116 C372,108 398,124 394,150 C398,172 370,182 350,178 C330,182 306,172 308,150 Z" fill="none" stroke="{INK}" stroke-width="1.2" filter="url(#rough)"/>')
    # --- 살포재 ---
    if a:
        g(f'<g fill="#FFFDF7" stroke="{RED}" stroke-width="1.2" filter="url(#rough)">' + ''.join(f'<circle cx="{x}" cy="{168.5+(x-150)*0.022:.1f}" r="2.8"/>' for x in (150, 167, 184, 201, 218)) + '</g>')
    else:
        g('<g fill="#7A5A30">' + ''.join(f'<circle cx="{x}" cy="{169+(x-140)*0.022 + (0.6 if x%20 else -0.4):.1f}" r="1.5"/>' for x in range(140, 232, 8)) + '</g>')
    # --- 물길 화살표(손으로 그은 곡선 + 열린 화살촉) ---
    col = RED if a else INK
    dash = '' if a else ' stroke-dasharray="7 5"'
    g(f'<path d="M70,161 C120,161 190,163 226,165 C232,175 230,188 233,200 C238,232 250,246 272,245 C292,244 305,238 316,232" fill="none" stroke="{col}" stroke-width="{2.4 if a else 1.8}" stroke-linecap="round"{dash} filter="url(#rough)"/>')
    g(f'<polyline points="303,229 317,232 307,242" fill="none" stroke="{col}" stroke-width="{2.4 if a else 1.8}" stroke-linecap="round" stroke-linejoin="round" filter="url(#rough)"/>')
    if not a:
        g(f'<ellipse cx="355" cy="220" rx="56" ry="36" fill="none" stroke="{GRN}" stroke-width="1.4" stroke-dasharray="4 4" filter="url(#rough)"/>')
    # --- 손글씨 주석 ---
    T = lambda x, y, s, size=15, fill=INK, anchor="start", rot=0, w=400, fam="Nanum Pen Script": g(f'<text x="{x}" y="{y}" font-family="{fam}" font-size="{size}" font-weight="{w}" fill="{fill}" text-anchor="{anchor}" transform="rotate({rot} {x} {y})">{s}</text>')
    if a:
        T(58, 132, "염화칼슘 살포", 21, RED, rot=-1.2); T(66, 153, "→ 염분 섞인 융설수 침투", 21, RED, rot=-1.2)
        T(352, 288, "근권부 염류집적", 23, RED, "middle", -2)
        # 치수
        g(f'<g filter="url(#rough)" stroke="{INK}" stroke-width="0.9" fill="none"><line x1="126" y1="104" x2="246" y2="104"/><line x1="126" y1="96" x2="126" y2="114"/><line x1="246" y1="96" x2="246" y2="150"/><line x1="122" y1="108" x2="130" y2="100"/><line x1="242" y1="108" x2="250" y2="100"/></g>')
        T(186, 98, "1,000", 19, INK, "middle")
    else:
        T(58, 132, "모래 살포(미끄럼 방지)", 21, INK, rot=-1.2); T(66, 153, "→ 융설수 침투, 염분 없음", 21, INK, rot=-1.2)
        T(352, 288, "근권부 정상", 23, GRN, "middle", -2)
    g('<rect x="150" y="236" width="76" height="22" rx="4" fill="#F7F2E7" opacity="0.92"/>')
    T(186, 252, "구배 2% →", 19, INK, "middle", -1)
    T(34, 164, "▽ FL", 17); T(400, 178, "▽ GL", 17)
    # --- 콜아웃 ---
    calls = [(70,179,70,318,"1"),(98,191,98,318,"2"),(126,208,126,318,"3"),(158,262,158,318,"4"),(262,166,290,110,"5"),(272,231,259,318,"6"),(410,268,410,318,"7"),(392,140,440,112,"8")]
    for x1,y1,x2,y2,n in calls:
        g(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{INK}" stroke-width="0.7" opacity="0.8" filter="url(#rough)"/>')
        cy = y2 + 9 if y2 > y1 else y2 - 9
        g(f'<ellipse cx="{x2}" cy="{cy}" rx="9" ry="8.4" fill="#FBF8F1" stroke="{INK}" stroke-width="1" filter="url(#rough)"/>')
        T(x2, cy + 6, n, 18, INK, "middle")
    # --- 단면 제목 ---
    g(f'<ellipse cx="40" cy="364" rx="15" ry="14" fill="none" stroke="{INK}" stroke-width="1.4" filter="url(#rough)"/>')
    T(40, 372, kind, 22, INK, "middle", 0, 400, "Nanum Pen Script")
    T(64, 368, kind + "-" + kind + "' 단면도" + (" — 염화칼슘 살포 구간" if a else " — 모래 살포 구간"), 26, INK, "start", -0.6, 400, "Nanum Pen Script")
    g(f'<path d="M64,375 C140,373 220,377 {330 if a else 300},374" stroke="{INK}" stroke-width="1.6" fill="none" filter="url(#rough)"/>')
    T(64, 394, "SCALE : NONE" + ("" if a else "   (구조는 A-A' 단면도와 동일)"), 17, "#6B6055")
    g('</g>')
    return "\n".join(o)

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 72 900 413" role="img" aria-label="손스케치 단면상세도: 화단 1m 이내 진입로에 뿌린 염화칼슘은 융설수에 실려 포장 기층과 경계석 기초 아래를 지나 근권에 염류로 쌓이고, 모래 구간은 같은 경로로 염분 없는 물만 들어간다">
  <defs>
    <filter id="rough" filterUnits="userSpaceOnUse" x="-20" y="0" width="960" height="600"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="2.6"/></filter>
    <filter id="rough2" filterUnits="userSpaceOnUse" x="-20" y="0" width="960" height="600"><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="11"/><feDisplacementMap in="SourceGraphic" scale="3.2"/></filter>
    <filter id="wash" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.022" numOctaves="3" seed="5"/><feDisplacementMap in="SourceGraphic" scale="9"/><feGaussianBlur stdDeviation="0.9"/></filter>
    <filter id="paper"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="2"/><feColorMatrix values="0 0 0 0 0.45  0 0 0 0 0.38  0 0 0 0 0.28  0 0 0 0.07 0"/></filter>
  </defs>
  <rect x="0" y="72" width="900" height="413" fill="#F7F2E7"/>
  <rect x="0" y="72" width="900" height="413" filter="url(#paper)"/>
  {sec(0, "A")}
  <path d="M450,100 C449,180 451,260 450,400" stroke="{INK}" stroke-width="0.7" stroke-dasharray="3 6" fill="none" opacity="0.5"/>
  {sec(450, "B")}
  <path d="M22,408 C300,406 600,410 878,407" stroke="{INK}" stroke-width="1" fill="none" filter="url(#rough)"/>
  <g font-family="Nanum Pen Script" font-size="20" fill="{INK}">
    <text x="24" y="430"><tspan font-size="15">①</tspan> 보도블럭 200×100×60</text><text x="240" y="430"><tspan font-size="15">②</tspan> 모래깔기 T=30</text><text x="440" y="430"><tspan font-size="15">③</tspan> 잡석다짐 T=150</text><text x="630" y="430"><tspan font-size="15">④</tspan> 원지반다짐</text>
    <text x="24" y="452"><tspan font-size="15">⑤</tspan> 화강경계석 150×150×1,000</text><text x="240" y="452"><tspan font-size="15">⑥</tspan> 기초콘크리트</text><text x="440" y="452"><tspan font-size="15">⑦</tspan> 식재토(양질토)</text><text x="630" y="452"><tspan font-size="15">⑧</tspan> 회양목 H0.6×W0.6 (점선: 뿌리분)</text>
  </g>
  <text x="24" y="476" font-family="Nanum Pen Script" font-size="17" fill="#6B6055">※ 포장 구성·경계석 규격은 주택 진입로 예시  ※ 단위 : mm  ※ FL 포장마감면 / GL 화단 지반면</text>
  <text x="876" y="475" font-family="Nanum Pen Script" font-size="18" fill="#6B6055" text-anchor="end">매거진그린 · 기획 AU</text>
</svg>'''
open(__import__("sys").argv[1], "w").write(svg)
