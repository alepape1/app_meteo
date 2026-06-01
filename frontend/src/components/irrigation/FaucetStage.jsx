import { useRef, useEffect, useLayoutEffect, useState, useCallback } from 'react'

const SPAWN_MS = 145
const G = 980
const V0 = 52
const TIP_RX = 0.887
const TIP_RY = 0.997

export default function FaucetStage({ open, height = 280 }) {
  const containerRef = useRef(null)
  const canvasRef    = useRef(null)
  const faucetRef    = useRef(null)
  const [w, setW]    = useState(320)
  const stRef = useRef({
    open, drops: [], ripples: [], lastSpawn: 0, prevT: 0,
    tx: 160, ty: 154,
  })
  const rafRef    = useRef(null)
  const [tipPos, setTipPos] = useState({ x: 160, y: 154 })
  const prevOpenRef  = useRef(open)
  const [settling, setSettling] = useState(false)

  useEffect(() => { stRef.current.open = open }, [open])

  useEffect(() => {
    if (!prevOpenRef.current && open) {
      setSettling(true)
      const t = setTimeout(() => setSettling(false), 500)
      return () => clearTimeout(t)
    }
    prevOpenRef.current = open
  }, [open])

  const calcTip = useCallback(() => {
    const container = containerRef.current
    const faucet    = faucetRef.current
    if (!container || !faucet || !faucet.naturalWidth) return
    const cr = container.getBoundingClientRect()
    const fr = faucet.getBoundingClientRect()
    if (!fr.width) return
    const tx = Math.round((fr.left - cr.left) + fr.width  * TIP_RX)
    const ty = Math.round((fr.top  - cr.top)  + fr.height * TIP_RY)
    stRef.current.tx = tx
    stRef.current.ty = ty
    setTipPos({ x: tx, y: ty })
  }, [])

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setW(Math.round(el.getBoundingClientRect().width))
      requestAnimationFrame(calcTip)
    })
    ro.observe(el)
    setW(Math.round(el.getBoundingClientRect().width))
    requestAnimationFrame(calcTip)
    return () => ro.disconnect()
  }, [calcTip])

  useEffect(() => {
    if (!w) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const s   = stRef.current
    const GY  = height - 38

    function spawnDrop(now) {
      s.drops.push({
        x:   s.tx + (Math.random() * 8 - 4),
        y:   s.ty + 2,
        vy:  V0 + Math.random() * 22,
        vx:  Math.random() * 12 - 6,
        r:   5  + Math.random() * 3.5,
        rot: Math.random() * 20 - 10,
        vr:  Math.random() * 30 - 15,
      })
      s.lastSpawn = now
    }

    function tick(now) {
      if (!s.prevT) s.prevT = now
      const dt = Math.min(50, now - s.prevT) / 1000
      s.prevT = now

      const tx = s.tx
      const ty = s.ty

      ctx.clearRect(0, 0, w, height)

      if (s.open && now - s.lastSpawn >= SPAWN_MS) spawnDrop(now)

      if (s.open) {
        const sg = ctx.createLinearGradient(tx, ty, tx, GY)
        sg.addColorStop(0,    'rgba(63,182,240,0)')
        sg.addColorStop(0.16, 'rgba(63,182,240,0.52)')
        sg.addColorStop(1,    'rgba(12,142,204,0.70)')
        ctx.beginPath()
        ctx.roundRect(tx - 2.5, ty, 5, GY - ty + 3, 2.5)
        ctx.fillStyle = sg
        ctx.fill()
        ctx.beginPath()
        ctx.moveTo(tx + 0.8, ty + 12)
        ctx.lineTo(tx + 0.8, GY - 12)
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'
        ctx.lineWidth = 1
        ctx.stroke()
      }

      for (let i = s.drops.length - 1; i >= 0; i--) {
        const d = s.drops[i]
        d.vy  += G * dt
        d.y   += d.vy * dt
        d.x   += d.vx * dt
        d.rot += d.vr * dt
        if (d.y + d.r >= GY) {
          s.ripples.push({ x: d.x, y: GY, born: now, maxR: 15 + Math.random() * 9 })
          s.drops.splice(i, 1)
          continue
        }
        ctx.save()
        ctx.translate(d.x, d.y)
        ctx.rotate(d.rot * Math.PI / 180)
        const sy = Math.min(1.55, 1 + d.vy / 2200)
        ctx.scale(1, sy)
        const dg = ctx.createLinearGradient(0, -d.r, 0, d.r)
        dg.addColorStop(0, '#3fb6f0')
        dg.addColorStop(1, '#0c8ecc')
        ctx.beginPath()
        ctx.moveTo(0, -d.r * 1.35)
        ctx.bezierCurveTo( d.r * 0.9, -d.r * 0.1,  d.r * 0.9,  d.r * 0.85, 0,  d.r * 1.15)
        ctx.bezierCurveTo(-d.r * 0.9,  d.r * 0.85, -d.r * 0.9, -d.r * 0.1, 0, -d.r * 1.35)
        ctx.fillStyle = dg
        ctx.fill()
        ctx.restore()
      }

      for (let i = s.ripples.length - 1; i >= 0; i--) {
        const r   = s.ripples[i]
        const age = (now - r.born) / 700
        if (age >= 1) { s.ripples.splice(i, 1); continue }
        const cr = r.maxR * age
        ctx.beginPath()
        ctx.ellipse(r.x, r.y, cr, cr * 0.32, 0, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(12,142,204,${0.6 * (1 - age)})`
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    s.prevT = 0
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(rafRef.current)
      s.prevT   = 0
      s.drops   = []
      s.ripples = []
    }
  }, [w, height])

  return (
    <div ref={containerRef} style={{
      position: 'relative', width: '100%', height,
      overflow: 'hidden', borderRadius: 12,
      background: 'linear-gradient(180deg,#fbfdff,#eef4fb)',
      border: '1px solid rgba(0,0,0,.07)',
    }}>
      <style>{`
        @keyframes fs-bob    { 0%,100%{transform:translateY(0)} 50%{transform:translateY(3px)} }
        @keyframes fs-sway   { 0%,100%{transform:rotate(-2.5deg)} 50%{transform:rotate(2.5deg)} }
        @keyframes fs-settle { 0%{transform:translateX(calc(-50% + 49px)) rotate(0deg)}
                               35%{transform:translateX(calc(-50% + 49px)) rotate(-1.4deg)}
                               100%{transform:translateX(calc(-50% + 49px)) rotate(0deg)} }
      `}</style>

      {/* Faucet image — spout tip measured dynamically via calcTip */}
      <img
        ref={faucetRef}
        src="/faucet.png"
        alt=""
        onLoad={calcTip}
        style={{
          position: 'absolute',
          top: 5,
          left: '50%',
          width: 'min(120px, 32%)',
          transform: settling
            ? undefined
            : 'translateX(calc(-50% + 49px))',
          animation: settling ? 'fs-settle .5s ease-out forwards' : undefined,
          pointerEvents: 'none',
          userSelect: 'none',
          WebkitUserDrag: 'none',
          filter: 'drop-shadow(0 8px 14px rgba(2,18,40,.18))',
          zIndex: 5,
        }}
      />

      {/* Particle canvas */}
      <canvas ref={canvasRef} width={w} height={height}
        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }} />

      {/* Bobbing hero drop when valve is closed */}
      {!open && (
        <div style={{
          position: 'absolute',
          left: tipPos.x - 5,
          top:  tipPos.y,
          width: 10, height: 14,
          borderRadius: '50% 50% 50% 50% / 40% 40% 60% 60%',
          background: 'linear-gradient(180deg,#3fb6f0,#0c8ecc)',
          animation: 'fs-bob 2.5s ease-in-out infinite',
          pointerEvents: 'none',
          filter: 'drop-shadow(0 2px 3px rgba(11,79,136,.3))',
        }} />
      )}

      {/* Sprouts */}
      <svg style={{ position: 'absolute', bottom: 36, left: 0, width: '100%', height: 48, overflow: 'visible', pointerEvents: 'none' }}
           viewBox={`0 0 ${w} 48`} preserveAspectRatio="none">
        {[0.12, 0.34, 0.57, 0.78].map((xr, i) => {
          const sx = xr * w
          const sh = 30 + (i % 2) * 10
          return (
            <g key={i} style={{
              transformOrigin: `${sx}px 48px`,
              transformBox: 'fill-box',
              ...(open ? { animation: `fs-sway ${2.8 + i * 0.3}s ease-in-out ${i * 0.42}s infinite` } : {}),
            }}>
              <line x1={sx} y1="48" x2={sx} y2={48 - sh} stroke="#15803d" strokeWidth="2.5" strokeLinecap="round"/>
              <path d={`M${sx},${48-sh*0.42} C${sx-7},${48-sh*0.6} ${sx-10},${48-sh*0.82} ${sx-5},${48-sh*0.92} C${sx-1},${48-sh*0.76} ${sx},${48-sh*0.6} ${sx},${48-sh*0.42}Z`}
                    fill="#22c55e"/>
              <path d={`M${sx},${48-sh*0.58} C${sx+7},${48-sh*0.72} ${sx+10},${48-sh*0.94} ${sx+5},${48-sh} C${sx+1},${48-sh*0.9} ${sx},${48-sh*0.74} ${sx},${48-sh*0.58}Z`}
                    fill="#16a34a"/>
            </g>
          )
        })}
      </svg>

      {/* Soil bed */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 38 }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,#5a4a3b,#3c3026)', borderTop: '2px solid #6b5847' }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(120px 22px at 50% 0%, rgba(12,142,204,.48), transparent 70%)',
            opacity: open ? 1 : 0, transition: 'opacity .5s',
          }}/>
        </div>
      </div>
    </div>
  )
}
