'use client';

import { Title, Text, Button, Card, Stack } from '@mantine/core';
import { useRouter } from 'next/navigation';

export default function NewLanding() {
  const router = useRouter();
  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: 'clamp(12px, 3vw, 24px)' }}>
      <Card withBorder radius="xl" p="xl" mb="md">
        <Stack gap="md">
          <Title order={1}>Welcome to PulseDock</Title>
          <Text c="dimmed">A fresh, focused landing is coming. This placeholder removes the old hero and gives a clean start.</Text>
          <div>
            <Button color="teal" onClick={() => router.push('/login')}>Get started</Button>
            <Button color="gray" variant="light" style={{ marginLeft: 8 }} onClick={() => router.push('/dashboard')}>Open dashboard</Button>
          </div>
        </Stack>
      </Card>
    </main>
  );
}
