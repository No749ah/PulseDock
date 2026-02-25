import Image from 'next/image'
import Link from 'next/link'

export default function Landing() {
  return (
    <main style={{fontFamily:'Inter, system-ui, -apple-system, Roboto, ' + "'Helvetica Neue', Arial" , padding: '48px 24px', background: '#0b0f14', color: '#e6eef6'}}>
      <section style={{maxWidth:1100, margin:'0 auto', display:'grid', gridTemplateColumns:'1fr 440px', gap:40, alignItems:'center'}}>
        <div>
          <h1 style={{fontSize:48, lineHeight:1.02, margin:0, fontWeight:700}}>PulseDock — Version intelligence, redesigned</h1>
          <p style={{marginTop:16, fontSize:18, color:'#bcd0df'}}>A modern, secure dashboard to track versions, changes and publish status pages — built for reliability and designer-grade polish.</p>

          <ul style={{display:'grid', gridTemplateColumns:'repeat(2, minmax(0,1fr))', gap:12, marginTop:28}}>
            <li style={{background:'#071021', padding:16, borderRadius:12}}>Realtime monitoring & alerts</li>
            <li style={{background:'#071021', padding:16, borderRadius:12}}>Autodiscovery & changelog summarization</li>
            <li style={{background:'#071021', padding:16, borderRadius:12}}>Publishable public status pages</li>
            <li style={{background:'#071021', padding:16, borderRadius:12}}>Enterprise-ready security</li>
          </ul>

          <div style={{marginTop:28}}>
            <Link href="/login"><a style={{display:'inline-block', padding:'12px 20px', background:'#0ea5a4', color:'#062425', borderRadius:10, fontWeight:700, textDecoration:'none'}}>Get started — Sign in</a></Link>
            <Link href="/docs/START.md"><a style={{display:'inline-block', marginLeft:12, padding:'12px 20px', background:'transparent', color:'#9fc0cc', borderRadius:10, border:'1px solid rgba(255,255,255,0.06)', textDecoration:'none'}}>Docs</a></Link>
          </div>

        </div>
        <div style={{padding:24, borderRadius:16, background:'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))', border:'1px solid rgba(255,255,255,0.03)'}}>
          <div style={{height:380, borderRadius:12, overflow:'hidden', background:'#02101a', display:'flex', alignItems:'center', justifyContent:'center'}}>
            <Image src="/apps/web/public/brand/pulsedock-logo.svg" alt="PulseDock" width={420} height={180} />
          </div>
          <p style={{marginTop:12, color:'#9fc0cc'}}>Designer-level landing crafted for clarity and conversion.</p>
        </div>
      </section>
    </main>
  )
}
