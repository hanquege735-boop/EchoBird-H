// MyProjects page — user-authored AI projects launchable via EchoBird.
//
// Mirrors the AppManager visual language (card grid + selected-tool detail)
// but with a localStorage-backed user project list instead of bundled tools.
// Cards show launcher + models.json path; the model id displayed in "模型: …"
// is filled in once we add the Rust read_active_model command for user
// projects (deferred to a follow-up turn — placeholder shows "—" for now).
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Folder, Pencil, Trash2, X, FolderHeart } from 'lucide-react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { useI18n } from '../../hooks/useI18n';
import {
  useMyProjectsStore,
  type MyProject,
  type MyProjectInput,
} from '../../stores/myProjectsStore';
import { useToolsStore } from '../../stores/toolsStore';
import { useAppManager } from '../AppManager/context';

// Placeholder examples shown inside the file-picker fields when nothing's
// been chosen yet. Kept in English path style across all locales — the
// example values themselves are filesystem paths, not translatable copy.
const PLACEHOLDER_ICON = 'e.g: ~/YourProject/xxx.ico/svg/png';
const PLACEHOLDER_LAUNCHER = 'e.g: ~/YourProject/xxx.exe';
const PLACEHOLDER_MODELS = 'e.g: ~/YourProject/models.json';

// Convert any stored icon path into something the WebView can render.
// Three flavours of `iconPath` reach this component:
//   - Seeded built-ins: "./icons/tools/<id>.svg" — Vite-served, use as-is
//   - User-picked via plugin-dialog: absolute filesystem path — needs file://
//   - Empty string: caller falls back to a placeholder glyph
const iconSrcFor = (p: string): string => {
  if (!p) return '';
  if (p.startsWith('./') || p.startsWith('/') || /^https?:/.test(p) || p.startsWith('data:')) {
    return p;
  }
  return `file://${p.replace(/\\/g, '/')}`;
};

// ── Card grid + dialog wiring ──

export const MyProjectsMain: React.FC = () => {
  const { t, locale } = useI18n();
  const projects = useMyProjectsStore((s) => s.projects);
  const initStore = useMyProjectsStore((s) => s.init);
  const seedBuiltins = useMyProjectsStore((s) => s.seedBuiltins);
  const detectedTools = useToolsStore((s) => s.detectedTools);
  // Reuse AppManager's selection state. Seeded entries set their
  // linkedToolId so the right panel + launch button drive the existing
  // tool flow (just like App Manager). Pure user projects don't have a
  // linkedToolId yet — selecting them currently leaves the panel empty
  // until Phase D wires their dedicated launch path.
  const { selectedTool, setSelectedTool } = useAppManager();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Hydrate from localStorage once on mount.
  useEffect(() => {
    initStore();
  }, [initStore]);

  // Seed Reversi + AI Translator into the user's project list the first time
  // the page mounts with tool data available. Idempotent — the store tracks
  // a flag so we only inject once per device, after which they're real
  // entries the user can edit or delete.
  useEffect(() => {
    if (detectedTools.length > 0) seedBuiltins(detectedTools, locale);
  }, [detectedTools, locale, seedBuiltins]);

  const openAdd = () => {
    setEditingId(null);
    setDialogOpen(true);
  };
  const openEdit = (id: string) => {
    setEditingId(id);
    setDialogOpen(true);
  };
  const closeDialog = () => setDialogOpen(false);

  const handleSelect = (project: MyProject) => {
    if (project.linkedToolId) {
      // Seeded built-in — hand selection off to AppManager so the right panel
      // shows that tool's model list and the launch button runs the existing
      // bundled-tool flow.
      setSelectedTool(project.linkedToolId);
    } else {
      // User project — clear AppManager selection for now; Phase D will
      // synthesise a virtual tool from the project's models.json so the
      // right panel can show its models and the launch button can spawn
      // the user-provided exe.
      setSelectedTool(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              selected={!!p.linkedToolId && selectedTool === p.linkedToolId}
              onSelect={() => handleSelect(p)}
              onEdit={openEdit}
            />
          ))}
          {/* "+" empty card — always last */}
          <button
            onClick={openAdd}
            className="relative p-5 border border-dashed border-cyber-border rounded-card bg-cyber-surface/40 flex flex-col items-center justify-center min-h-[160px] text-cyber-text-secondary hover:text-cyber-text hover:border-cyber-text/40 hover:bg-cyber-surface transition-colors outline-none"
          >
            <Plus size={28} className="mb-2" />
            <span className="text-[14px] font-medium">{t('myProjects.empty.title')}</span>
            <span className="text-[12px] mt-1 text-cyber-text-muted">
              {t('myProjects.empty.hint')}
            </span>
          </button>
        </div>
      </div>

      {dialogOpen && <AddProjectDialog editingId={editingId} onClose={closeDialog} />}
    </div>
  );
};

// ── Individual project card ──

const ProjectCard: React.FC<{
  project: MyProject;
  selected: boolean;
  onSelect: () => void;
  onEdit: (id: string) => void;
}> = ({ project, selected, onSelect, onEdit }) => {
  const { t } = useI18n();
  const detectedTools = useToolsStore((s) => s.detectedTools);
  const deleteProject = useMyProjectsStore((s) => s.deleteProject);

  // For seeded built-ins, mirror the active model id off the live tool scan
  // so the card stays in sync when the user swaps the model from the right
  // panel — same source App Manager reads from. User-only projects get a
  // dash until Phase D adds models.json model-id read-back.
  const activeModel = project.linkedToolId
    ? detectedTools.find((t) => t.id === project.linkedToolId)?.activeModel
    : undefined;

  const iconSrc = iconSrcFor(project.iconPath);

  return (
    <div
      onClick={onSelect}
      className={`relative p-5 border rounded-card bg-cyber-surface flex flex-col min-h-[160px] group transition-colors cursor-pointer ${
        selected ? 'border-cyber-accent' : 'border-cyber-border hover:border-cyber-text/30'
      }`}
    >
      {/* Icon top-right — accepts Vite-served URLs (./icons/...) for seeded
          built-ins and absolute file:// paths for user-picked icons. Falls
          back to FolderHeart on missing file or load error. */}
      <div className="absolute top-4 right-4 w-10 h-10 rounded-lg bg-cyber-elevated flex items-center justify-center overflow-hidden">
        {iconSrc ? (
          <img
            src={iconSrc}
            alt=""
            className="w-7 h-7 object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <FolderHeart size={20} className="text-cyber-text-secondary" />
        )}
      </div>

      <h3 className="text-[15px] font-semibold text-cyber-text mb-4 pr-12 truncate">
        {project.name}
      </h3>

      <div className="space-y-1.5 text-[12px] text-cyber-text-secondary flex-1">
        <div className="truncate">
          <span className="text-cyber-text-muted">模型: </span>
          <span>{activeModel || '—'}</span>
        </div>
        <div className="truncate">
          <span className="text-cyber-text-muted">应用: </span>
          <span>{project.launcherPath || '—'}</span>
        </div>
        <div className="truncate">
          <span className="text-cyber-text-muted">配置: </span>
          <span>{project.modelsJsonPath || '—'}</span>
        </div>
      </div>

      {/* Actions row — replaces the "版本: 1.0" line that App Manager renders.
          User-developed projects don't have a meaningful version concept, so
          we use the same slot for the delete/edit affordance. Buttons stop
          propagation so they don't also trigger card selection. */}
      <div className="flex items-center justify-end gap-2 mt-3 opacity-70 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(project.id);
          }}
          className="text-[12px] text-cyber-text-secondary hover:text-cyber-text px-2 py-0.5 rounded hover:bg-cyber-elevated transition-colors flex items-center gap-1"
        >
          <Pencil size={12} />
          {t('btn.edit')}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            deleteProject(project.id);
          }}
          className="text-[12px] text-cyber-text-secondary hover:text-cyber-error px-2 py-0.5 rounded hover:bg-cyber-elevated transition-colors flex items-center gap-1"
        >
          <Trash2 size={12} />
          {t('btn.delete')}
        </button>
      </div>
    </div>
  );
};

// ── Add / Edit dialog ──

const AddProjectDialog: React.FC<{
  editingId: string | null;
  onClose: () => void;
}> = ({ editingId, onClose }) => {
  const { t } = useI18n();
  const projects = useMyProjectsStore((s) => s.projects);
  const addProject = useMyProjectsStore((s) => s.addProject);
  const updateProject = useMyProjectsStore((s) => s.updateProject);

  // Initial values: empty (Add) or existing project (Edit).
  const existing = editingId ? projects.find((p) => p.id === editingId) : null;
  const [name, setName] = useState(existing?.name ?? '');
  const [iconPath, setIconPath] = useState(existing?.iconPath ?? '');
  const [launcherPath, setLauncherPath] = useState(existing?.launcherPath ?? '');
  const [modelsJsonPath, setModelsJsonPath] = useState(existing?.modelsJsonPath ?? '');

  // ESC closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const pickFile = useCallback(
    async (filters: { name: string; extensions: string[] }[], setter: (v: string) => void) => {
      try {
        const result = await openDialog({ multiple: false, filters });
        if (typeof result === 'string') setter(result);
      } catch (e) {
        console.error('[MyProjects] file picker failed:', e);
      }
    },
    []
  );

  const canSave = name.trim().length > 0 && launcherPath && modelsJsonPath;

  const handleSave = useCallback(() => {
    if (!canSave) return;
    const input: MyProjectInput = {
      name: name.trim(),
      iconPath,
      launcherPath,
      modelsJsonPath,
    };
    if (editingId) {
      updateProject(editingId, input);
    } else {
      addProject(input);
    }
    onClose();
  }, [
    canSave,
    name,
    iconPath,
    launcherPath,
    modelsJsonPath,
    editingId,
    updateProject,
    addProject,
    onClose,
  ]);

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-[480px] max-w-[92vw] border border-cyber-border/40 bg-cyber-surface shadow-2xl rounded-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-px w-full bg-cyber-border" />
        <div className="px-6 pt-5 pb-4 flex items-center justify-between">
          <span className="text-lg font-bold text-cyber-text font-mono">
            &gt;_ {t('myProjects.dialog.title')}
          </span>
          <button
            onClick={onClose}
            className="text-cyber-text-secondary hover:text-cyber-text transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 pb-6 space-y-4">
          <FieldLabel label={t('myProjects.field.name')}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('myProjects.placeholder.name')}
              className="w-full px-3 py-2 bg-cyber-input border border-cyber-border rounded text-[14px] text-cyber-text placeholder:text-cyber-text-muted focus:border-cyber-text/40 transition-colors outline-none"
            />
          </FieldLabel>

          <FieldLabel label={t('myProjects.field.icon')}>
            <FilePickerButton
              value={iconPath}
              placeholder={PLACEHOLDER_ICON}
              onClick={() =>
                pickFile([{ name: 'Icon', extensions: ['ico', 'svg', 'png'] }], setIconPath)
              }
            />
          </FieldLabel>

          <FieldLabel label={t('myProjects.field.launcher')}>
            <FilePickerButton
              value={launcherPath}
              placeholder={PLACEHOLDER_LAUNCHER}
              onClick={() =>
                pickFile(
                  // Windows: filter to exe. Other platforms: no filter (let user
                  // pick any executable — .app bundle on macOS is a directory
                  // and the dialog handles that natively).
                  navigator.platform.toLowerCase().includes('win')
                    ? [{ name: 'Executable', extensions: ['exe'] }]
                    : [],
                  setLauncherPath
                )
              }
            />
          </FieldLabel>

          <FieldLabel label={t('myProjects.field.models')}>
            <FilePickerButton
              value={modelsJsonPath}
              placeholder={PLACEHOLDER_MODELS}
              onClick={() =>
                pickFile([{ name: 'models.json', extensions: ['json'] }], setModelsJsonPath)
              }
            />
          </FieldLabel>
        </div>

        <div className="flex border-t border-cyber-border/40">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 text-[14px] text-cyber-text-secondary hover:text-cyber-text hover:bg-cyber-elevated transition-colors"
          >
            {t('btn.cancel')}
          </button>
          <div className="w-px bg-cyber-border/40" />
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="flex-1 px-6 py-3 text-[14px] text-cyber-text hover:bg-cyber-elevated transition-colors font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('btn.save')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Small helpers ──

const FieldLabel: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div className="space-y-1.5">
    <div className="text-[13px] text-cyber-text-secondary font-medium">{label}</div>
    {children}
  </div>
);

// Visually a text input (matches the project-name field above) but acts as a
// file picker — clicking anywhere on the row opens the OS dialog. Placeholder
// shows the example path until the user picks something. No hover tooltip:
// the box itself is the only thing the user looks at.
const FilePickerButton: React.FC<{
  value: string;
  placeholder: string;
  onClick: () => void;
}> = ({ value, placeholder, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full px-3 py-2 bg-cyber-input border border-cyber-border rounded text-[14px] text-left flex items-center justify-between gap-2 hover:border-cyber-text/40 transition-colors outline-none"
  >
    <span className={`truncate ${value ? 'text-cyber-text' : 'text-cyber-text-muted'}`}>
      {value || placeholder}
    </span>
    <Folder size={14} className="flex-shrink-0 text-cyber-text-secondary" />
  </button>
);
