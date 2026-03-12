'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Edit, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { AppFrame } from '../../components/app-frame';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Modal } from '../components/Modal';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../components/Table';
import { Select } from '../components/Select';
import { getToken, getUser } from '../../components/auth';
import { api } from '../../lib/api';

type Folder = { id: string; name: string; createdAt: string };

const inputClass = "w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent";

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
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border border-accent border-t-transparent" />
        </div>
      ) : (
        <>
          {/* Create Modal */}
          <Modal
            isOpen={createOpen}
            onClose={() => { setCreateOpen(false); resetCreateForm(); }}
            title="Create project"
            actions={
              <div className="flex items-center justify-between w-full">
                <Button variant="secondary" onClick={() => setCreateStep((s) => Math.max(0, s - 1))} disabled={createStep === 0}>Back</Button>
                {createStep < 1
                  ? <Button onClick={() => setCreateStep(1)}>Next</Button>
                  : <Button onClick={createFolder}>Create project</Button>
                }
              </div>
            }
          >
            {createStep === 0 && (
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Project name</label>
                <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            )}
            {createStep === 1 && (
              <p className="text-sm text-text-primary">Project name: <strong>{name}</strong></p>
            )}
          </Modal>

          {/* Edit Modal */}
          <Modal
            isOpen={editOpen}
            onClose={() => setEditOpen(false)}
            title="Edit project"
            actions={
              <>
                <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
                <Button onClick={saveEdit}>Save</Button>
              </>
            }
          >
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Project name</label>
              <input className={inputClass} value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
          </Modal>

          {/* Delete Confirm Modal */}
          <Modal
            isOpen={deleteOpen}
            onClose={() => setDeleteOpen(false)}
            title="Delete project"
            actions={
              <>
                <Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button>
                <Button variant="primary" className="!bg-danger hover:!bg-danger/80" onClick={confirmDelete}>Delete</Button>
              </>
            }
          >
            <p className="text-text-primary">Delete <strong>{selected?.name}</strong>?</p>
          </Modal>

          {/* Header Card */}
          <Card className="mb-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-text-primary">Projects</h3>
              <Button onClick={() => { resetCreateForm(); setCreateOpen(true); }} size="sm">
                <span className="flex items-center gap-2"><Plus className="w-4 h-4" /> Create project</span>
              </Button>
            </div>
          </Card>

          {/* Table Card */}
          <Card>
            <Table>
              <TableHead>
                <TableRow hover={false}>
                  <TableHeader>Name</TableHeader>
                  <TableHeader>Created</TableHeader>
                  <TableHeader>Actions</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {pageRows.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>{f.name}</TableCell>
                    <TableCell>{new Date(f.createdAt).toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(f)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openDelete(f)} className="text-danger hover:text-danger">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm text-text-secondary">Page {safePage} of {pages}</span>
                <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={safePage >= pages}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-text-secondary">Rows per page</span>
                <Select
                  value={pageSize}
                  onChange={(v) => { setPageSize(v || '10'); setPage(1); }}
                  options={[{ value: '10', label: '10' }, { value: '25', label: '25' }, { value: '50', label: '50' }]}
                  className="w-20"
                />
              </div>
            </div>
          </Card>
        </>
      )}
    </AppFrame>
  );
}
