'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Edit, Trash2, ChevronLeft, ChevronRight, Folder } from 'lucide-react';
import { AppFrame } from '../../components/app-frame';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Modal } from '../components/Modal';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../components/Table';
import { Select } from '../components/Select';
import { getUser } from '../../components/auth';
import { api } from '../../lib/api';

type Folder = { id: string; name: string; createdAt: string };

const inputClass = "w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent";

export default function FoldersPage() {
  const router = useRouter();
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
    if (!user) router.push('/login');
  }, [router]);

  async function load() {
    setLoading(true);
    try {
      setFolders(await api<Folder[]>('/v1/folders'));
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
    await api('/v1/folders', undefined, { method: 'POST', body: JSON.stringify({ name }) });
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
    await api(`/v1/folders/${selected.id}`, undefined, { method: 'PATCH', body: JSON.stringify({ name: editName }) });
    setEditOpen(false);
    await load();
  }

  function openDelete(folder: Folder) {
    setSelected(folder);
    setDeleteOpen(true);
  }

  async function confirmDelete() {
    if (!selected) return;
    await api(`/v1/folders/${selected.id}`, undefined, { method: 'DELETE' });
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
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-accent border-t-transparent" />
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

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-text-primary">Projects</h2>
              <p className="text-text-secondary text-sm mt-1">
                {folders.length} {folders.length === 1 ? 'project' : 'projects'}
              </p>
            </div>
            <Button size="lg" onClick={() => { resetCreateForm(); setCreateOpen(true); }}>
              <span className="flex items-center gap-2"><Plus className="w-4 h-4" /> Create project</span>
            </Button>
          </div>

          {folders.length === 0 ? (
            <Card className="text-center py-16">
              <div className="p-4 rounded-2xl bg-surface-elevated inline-block mb-4">
                <Folder className="w-12 h-12 text-text-secondary opacity-50" />
              </div>
              <p className="text-text-primary text-lg font-medium mb-2">No projects yet</p>
              <p className="text-text-secondary text-sm mb-6">
                Organize your monitors by environment, product, or customer space
              </p>
              <Button size="lg" onClick={() => { resetCreateForm(); setCreateOpen(true); }}>Create your first project</Button>
            </Card>
          ) : (
          <>
          {/* Table Card */}
          <Card className="p-0">
            <div className="overflow-x-auto">
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
            <div className="flex flex-col gap-3 p-4 border-t border-border sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm text-text-secondary">Page {safePage} of {pages}</span>
                <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={safePage >= pages}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2 sm:justify-end">
                <span className="text-sm text-text-secondary">Rows per page</span>
                <Select
                  value={pageSize}
                  onChange={(v) => { setPageSize(v || '10'); setPage(1); }}
                  options={[{ value: '10', label: '10' }, { value: '25', label: '25' }, { value: '50', label: '50' }]}
                  className="w-20"
                />
              </div>
            </div>
            </div>
          </Card>
          </>
          )}
        </>
      )}
    </AppFrame>
  );
}
