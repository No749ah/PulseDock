'use client'

import { useEffect } from 'react'
import { Button, Container, Title, Card, Group } from '@mantine/core'
import { useRouter } from 'next/navigation'

export default function NewLanding() {
  const router = useRouter()

  useEffect(() => {
    const els = document.querySelectorAll('.ld-fade-up')
    els.forEach((n, i) => {
      const el = n as HTMLElement
      el.style.transition = `transform 600ms cubic-bezier(.2,.9,.2,1) ${i * 80}ms, opacity 600ms ease ${i * 80}ms`
      el.style.transform = 'translateY(0)'
      el.style.opacity = '1'
    })
  }, [])

  return (
    <div style={{ background: 'linear-gradient(180deg, #0f1724 0%, #071024 60%)', color: '#eef6ff', minHeight: '80vh', padding: '48px 0' }}>
      <Container size="lg">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 24 }}>
          <div>
            <div className="ld-fade-up" style={{ transform: 'translateY(18px)', opacity: 0 }}>
              <p style={{ margin: 0, color: '#6ff', letterSpacing: '0.08em', fontWeight: 700, fontSize: '0.9rem' }}>PulseDock</p>
            </div>

            <div className="ld-fade-up" style={{ transform: 'translateY(18px)', opacity: 0 }}>
              <Title order={1} style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', marginTop: 12, lineHeight: 1.02 }}>
                Unified uptime & release intelligence for modern ops teams
              </Title>
            </div>

            <div className="ld-fade-up" style={{ transform: 'translateY(18px)', opacity: 0 }}>
              <p style={{ marginTop: 16, color: 'rgba(238,246,255,0.8)', fontSize: '1.05rem' }}>
                Track versions, monitor health, and get fewer but smarter alerts. Opinionated defaults,
                easy onboarding, and clear incident semantics so your team spends less time troubleshooting and more time building.
              </p>
            </div>

            <Group mt={24} spacing="md" className="ld-fade-up" style={{ transform: 'translateY(18px)', opacity: 0 }}>
              <Button size="lg" color="teal" onClick={() => router.push('/login')}>Get started</Button>
              <Button size="lg" variant="outline" onClick={() => router.push('/dashboard')}>Open dashboard</Button>
            </Group>

            <div className="ld-fade-up" style={{ display: 'flex', gap: 12, marginTop: 28, transform: 'translateY(18px)', opacity: 0 }} aria-hidden>
              <Card radius="md" p="sm" withBorder style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.04)' }}>
                <p style={{ margin: 0, fontWeight: 700 }}>99.99%</p>
                <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>Uptime checks</p>
              </Card>
              <Card radius="md" p="sm" withBorder style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.04)' }}>
                <p style={{ margin: 0, fontWeight: 700 }}>Auto onboarding</p>
                <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>Smart defaults</p>
              </Card>
              <Card radius="md" p="sm" withBorder style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.04)' }}>
                <p style={{ margin: 0, fontWeight: 700 }}>Integrations</p>
                <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>Slack, Discord, Webhooks</p>
              </Card>
            </div>
          </div>

          <div>
            <div style={{ display: 'grid', gap: 14 }}>
              <div className="ld-fade-up" aria-hidden style={{ background: 'linear-gradient(135deg,#06203a,#08334f)', borderRadius: 16, padding: 18, minHeight: 240, color: '#bfe9ff', transform: 'translateY(18px)', opacity: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ margin: 0, fontWeight: 700 }}>Live status</p>
                  <div style={{ background: '#063b2f', padding: '6px 10px', borderRadius: 999 }}><span style={{ fontSize: '0.85rem', color: 'lime' }}>All systems nominal</span></div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <div style={{ height: 120, background: 'linear-gradient(90deg,#0ea5a5,transparent)', borderRadius: 8 }} />
                </div>
              </div>

              <div className="ld-fade-up" aria-hidden style={{ display: 'flex', gap: 12, transform: 'translateY(18px)', opacity: 0 }}>
                <Card radius="md" p="md" withBorder style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: 700 }}>Version freshness</p>
                  <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)' }}>See which services are behind and why.</p>
                </Card>
                <Card radius="md" p="md" withBorder style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: 700 }}>Alerts</p>
                  <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)' }}>Opinionated signals, less noise.</p>
                </Card>
              </div>

            </div>
          </div>
        </div>
      </Container>

      <style jsx global>{`
        .ld-fade-up { transform: translateY(18px); opacity: 0; }
        .ld-fade-up.visible { transform: translateY(0); opacity: 1; }
        @media (prefers-reduced-motion: reduce) { .ld-fade-up { transition: none !important; } }
      `}</style>
    </div>
  )
}
