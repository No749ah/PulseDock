'use client';

import { Button, Card, Group, Pagination, Select, Table, Text, TextInput } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppFrame } from '../../components/app-frame';
import { LoadingState } from '../../components/ui/loading-state';
import { AppModal, ConfirmModal } from '../../components/ui/modal-framework';
import { getToken, getUser } from '../../components/auth';
import { api } from '../../lib/api';

type Folder = { id: string; name: string; createdAt: string };

export default function FoldersPage() {
  const router = useRouter();
  const token = useMemo(() => (typeof window !== 'undefined' ? getToken() : ''), []);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('10');

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<Folder | null>(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    const user = getUser();
    if (!user || !token) router.push('/login');
  }, [router, token]);

  async function load() {
    setLoading(true);
    try {
      setFolders(await api<Folder[]>('/v1/folders', token));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load().catch(() => router.push('/login')); }, []);

  function resetCreateForm() {
    setName('');
    setCreateStep(0);
  }

  async function createFolder() {
    await api('/v1/folders', token, { method: 'POST', body: JSON.stringify({ name }) });
    resetCreateForm();
    setCreateOpen(false);
    await load();
  }

  function openEdit(folder: Folder) {
    setSelected(folder);
    setEditName(folder.name);
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!selected) return;
    await api(`/v1/folders/${selected.id}`, token, { method: 'PATCH', body: JSON.stringify({ name: editName }) });
    setEditOpen(false);
    await load();
  }

  function openDelete(folder: Folder) {
    setSelected(folder);
    setDeleteOpen(true);
  }

  async function confirmDelete() {
    if (!selected) return;
    await api(`/v1/folders/${selected.id}`, token, { method: 'DELETE' });
    setDeleteOpen(false);
    await load();
  }

  const size = Number(pageSize);
  const pages = Math.max(1, Math.ceil(folders.length / size));
  const safePage = Math.min(page, pages);
  const pageRows = folders.slice((safePage - 1) * size, safePage * size);

  return (
    <AppFrame title="Projects" subtitle="Group monitors by environment, product, or customer space.">
      {loading ? <LoadingState label="Loading projects..." /> : <>
      <AppModal opened={createOpen} onClose={() => { setCreateOpen(false); resetCreateForm(); }} title="Create project">
        {createStep === 0 ? <TextInput label="Project name" value={name} onChange={(e) => setName(e.currentTarget.value)} /> : null}
        {createStep === 1 ? <Text size="sm">Project name: <b>{name}</b></Text> : null}
        <Group mt="md" justify="space-between">
          <Button variant="default" onClick={() => setCreateStep((s) => Math.max(0, s - 1))} disabled={createStep === 0}>Back</Button>
          {createStep < 1 ? <Button onClick={() => setCreateStep(1)}>Next</Button> : <Button onClick={createFolder}>Create project</Button>}
        </Group>
      </AppModal>

      <AppModal opened={editOpen} onClose={() => setEditOpen(false)} title="Edit project">
        <TextInput label="Project name" value={editName} onChange={(e) => setEditName(e.currentTarget.value)} />
        <Group mt="md" justify="flex-end">
          <Button variant="default" onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button onClick={saveEdit}>Save</Button>
        </Group>
      </AppModal>

      <ConfirmModal
        opened={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete project"
        message={<>Delete <b>{selected?.name}</b>?</>}
        onConfirm={confirmDelete}
        confirmLabel="Delete"
      />

      <Card withBorder radius="md" mb="md">
        <Group justify="space-between">
          <Text fw={700}>Projects</Text>
          <Button onClick={() => { resetCreateForm(); setCreateOpen(true); }}>Create project</Button>
        </Group>
      </Card>

      <Card withBorder radius="md">
        <Table withTableBorder withColumnBorders>
          <Table.Thead><Table.Tr><Table.Th>Name</Table.Th><Table.Th>Created</Table.Th><Table.Th>Actions</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {pageRows.map((f) => (
              <Table.Tr key={f.id}>
                <Table.Td>{f.name}</Table.Td>
                <Table.Td>{new Date(f.createdAt).toLocaleString()}</Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Button size="xs" variant="light" onClick={() => openEdit(f)}>Edit</Button>
                    <Button size="xs" variant="light" color="red" onClick={() => openDelete(f)}>Delete</Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <Group justify="space-between" mt="md">
          <Pagination value={safePage} onChange={setPage} total={pages} />
          <Group gap="xs">
            <Text size="sm" c="dimmed">Rows per page</Text>
            <Select w={90} value={pageSize} onChange={(v) => { setPageSize(v || '10'); setPage(1); }} data={['10', '25', '50']} />
          </Group>
        </Group>
      </Card>
      </>}
    </AppFrame>
  );
}
