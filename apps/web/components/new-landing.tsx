'use client'

import { useEffect } from 'react'
import { Button, Container, Title, Text, Card, Group } from '@mantine/core'
import { useRouter } from 'next/navigation'

export default function NewLanding() {
  const router = useRouter()

  useEffect(() => {
    // small entrance animation trigger
    const el = document.querySelectorAll('.ld-fade-up')
    el.forEach((n, i) => {
      ;(n as HTMLElement).style.transition = 'transform 600ms cubic-bezier(.2,.9,.2,1) ' + (i * 80) + 'ms, opacity 600ms ease ' + (i * 80) + 'ms'
      ;(n as HTMLElement).style.transform = 'translateY(0)'
      ;(n as HTMLElement).style.opacity = '1'
    })
  }, [])

  return (
    <div style={{ background: 'linear-gradient(180deg, #0f1724 0%, #071024 60%)', color: '#eef6ff', minHeight: '80vh', padding: '48px 0' }}>
      <Container size="lg">
        <div style={{display:'grid', gridTemplateColumns: '1fr', gap:24}} className="ld-grid">
          <div style={{gridColumn: '1 / -1'}}>
            <div style={{ transform: 'translateY(18px)', opacity: 0 }} className="ld-fade-up">
              <Text size="sm" color="cyan" weight={700} style={{ letterSpacing: '0.08em' }}>PulseDock</Text>
            </div>

            <div style={{ transform: 'translateY(18px)', opacity: 0 }} className="ld-fade-up">
              <Title order={1} style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', marginTop: 12, lineHeight: 1.02 }}>
                Unified uptime & release intelligence for modern ops teams
              </Title>
            </div>

            <div style={{ transform: 'translateY(18px)', opacity: 0 }} className="ld-fade-up">
              <Text color="rgba(238,246,255,0.8)" size="lg" mt={16}>
                Track versions, monitor health, and get fewer but smarter alerts. Opinionated defaults,
                easy onboarding, and clear incident semantics so your team spends less time troubleshooting and more time building.
              </Text>
            </div>

            <Group mt={24} spacing="md" className="ld-fade-up" style={{ transform: 'translateY(18px)', opacity: 0 }}>
              <Button size="lg" color="teal" onClick={() => router.push('/login')}>Get started</Button>
              <Button size="lg" variant="outline" onClick={() => router.push('/dashboard')}>Open dashboard</Button>
            </Group>

            <div style={{ display: 'flex', gap: 12, marginTop: 28 }} className="ld-fade-up" aria-hidden style={{ transform: 'translateY(18px)', opacity: 0 }}>
              <Card radius="md" p="sm" withBorder style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.04)' }}>
                <Text weight={700}>99.99%</Text>
                <Text size="xs" color="dimmed">Uptime checks</Text>
              </Card>
              <Card radius="md" p="sm" withBorder style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.04)' }}>
                <Text weight={700}>Auto onboarding</Text>
                <Text size="xs" color="dimmed">Smart defaults</Text>
              </Card>
              <Card radius="md" p="sm" withBorder style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.04)' }}>
                <Text weight={700}>Integrations</Text>
                <Text size="xs" color="dimmed">Slack, Discord, Webhooks</Text>
              </Card>
            </div>
          </div>

          <div style={{gridColumn: '1 / -1'}}>
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ background: 'linear-gradient(135deg,#06203a,#08334f)', borderRadius: 16, padding: 18, minHeight: 240, color: '#bfe9ff' }} className="ld-fade-up" aria-hidden>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text weight={700}>Live status</Text>
                  <div style={{ background: '#063b2f', padding: '6px 10px', borderRadius: 999 }}><Text size='xs' color='lime'>All systems nominal</Text></div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <div style={{ height: 120, background: 'linear-gradient(90deg,#0ea5a5,transparent)', borderRadius: 8 }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12 }} className="ld-fade-up" aria-hidden>
                <Card radius="md" p="md" withBorder style={{ flex: 1 }}>
                  <Text weight={700}>Version freshness</Text>
                  <Text size="sm" color="dimmed">See which services are behind and why.</Text>
                </Card>
                <Card radius="md" p="md" withBorder style={{ flex: 1 }}>
                  <Text weight={700}>Alerts</Text>
                  <Text size="sm" color="dimmed">Opinionated signals, less noise.</Text>
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
