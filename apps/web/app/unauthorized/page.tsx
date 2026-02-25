import { Card, Stack, Text, Title } from '@mantine/core';

export default function UnauthorizedPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <Card withBorder shadow="md" radius="lg" p="xl" style={{ maxWidth: 480, width: '100%' }}>
        <Stack align="center">
          <Title order={2} style={{ fontSize: 'clamp(1.4rem, 5vw, 1.9rem)', textAlign: 'center' }}>Unauthorized</Title>
          <Text c="dimmed" ta="center">You do not have permission to access this page.</Text>
          <a href="/dashboard" style={{ color: '#8fb0ff', fontWeight: 600, textAlign: 'center', width: '100%' }}>Back to dashboard</a>
        </Stack>
      </Card>
    </div>
  );
}
