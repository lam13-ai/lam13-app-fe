import type { ArchiveFile, CalendarEvent, CalendarTask, Project, ProjectSummary } from '@/types/api';
import { request, requestJson } from './http';
import type { CalendarService, ProjectsService } from './services';

/**
 * Projects and Calendar against the backend (lam13-app: api/routers/projects_route.py,
 * project_files_route.py, project_chats_route.py, calendar_route.py; schemas in api/schemas/projects.py
 * and calendar.py). The DTOs below are those schemas, field for field.
 */

// ── Backend DTOs ─────────────────────────────────────────────────────────────

interface ProjectDto {
  id: string;
  name: string;
  instructions: string;
  summary: string;
  owner_id: string;
  role: 'owner' | 'member';
  created_at: string;
  updated_at: string;
}
interface MemberDto {
  user_id: string;
  name: string;
  email: string;
  role: 'owner' | 'member';
  created_at: string;
}
interface ProjectContactDto {
  contact_id: string;
  full_name: string;
  position?: string | null;
  company?: string | null;
  email?: string | null;
  added_by: string;
  created_at: string;
}
interface FolderDto {
  id: string;
  project_id: string;
  name: string;
}
interface ProjectFileDto {
  id: string;
  project_id: string;
  folder_id?: string | null;
  name: string;
  content_type: string;
  size_bytes: number;
  uploaded_by: string;
  uploaded_by_name?: string;
  created_at: string;
  /** "pending" | "ready" | "failed" | "not_indexed" */
  processing_status: string;
}
interface ProjectChatDto {
  sessionId: string;
  title: string;
  projectId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
interface CalendarEventDto {
  id: string;
  kind: 'event' | 'meeting';
  source: string;
  title: string;
  description?: string;
  start_at: string;
  end_at?: string | null;
  location?: string | null;
  meeting_url?: string | null;
  platform?: 'google_meet' | 'microsoft_teams' | 'zoom' | 'webex' | 'unknown' | null;
  project_id?: string | null;
  meeting_id?: string | null;
}
interface CalendarTaskDto {
  id: string;
  title: string;
  assignee?: string | null;
  completed: boolean;
  meeting_id: string;
  index: number;
  meeting_title: string;
  meeting_started_at: string;
}
/** The part of GET/PATCH /meetings/{id} a ticked task needs. */
interface MeetingDto {
  id: string;
  title: string;
  started_at: string;
  action_items: { id: string; text: string; completed: boolean }[];
}

// ── Mapping ──────────────────────────────────────────────────────────────────

/** The backend stores UTC and writes some timestamps without an offset: read those as UTC, not local time. */
const utc = (value: string) => (!value || /(Z|[+-]\d\d:?\d\d)$/.test(value) ? value : `${value}Z`);

const enc = encodeURIComponent;
const projectPath = (id: string, rest = '') => `/projects/${enc(id)}${rest}`;

const toSummary = (dto: ProjectDto): ProjectSummary => ({
  id: dto.id,
  name: dto.name,
  description: dto.summary ?? '',
  updated_at: utc(dto.updated_at),
  role: dto.role,
});

const FILE_STATUS: Record<string, ArchiveFile['status']> = { ready: 'ready', pending: 'processing', failed: 'failed', not_indexed: 'stored' };

function toFile(dto: ProjectFileDto): ArchiveFile {
  const extension = (dto.name.includes('.') ? dto.name.split('.').pop()! : 'file').toUpperCase();
  return {
    id: dto.id,
    name: dto.name,
    kind: dto.content_type.startsWith('image/') ? 'image' : /presentation|powerpoint/.test(dto.content_type) ? 'presentation' : 'document',
    extension,
    size_bytes: dto.size_bytes,
    uploaded_at: utc(dto.created_at),
    uploaded_by: dto.uploaded_by_name || 'A team member',
    folder_id: dto.folder_id ?? null,
    status: FILE_STATUS[dto.processing_status] ?? 'stored',
  };
}

const PLATFORMS: Record<string, CalendarEvent['location']> = {
  google_meet: 'meet',
  microsoft_teams: 'teams',
  zoom: 'zoom',
  webex: 'webex',
  unknown: 'online',
};

function toEvent(dto: CalendarEventDto, projectNames: Map<string, string>): CalendarEvent {
  const place = dto.location?.trim() || null;
  return {
    id: dto.id,
    title: dto.title,
    starts_at: dto.start_at,
    ends_at: dto.end_at ?? null,
    // The platform is the backend's (from the join link). A place with no link is shown as that place.
    location: (dto.platform && PLATFORMS[dto.platform]) || (place ? 'in-person' : null),
    location_text: place,
    meeting_url: dto.meeting_url ?? null,
    meeting_id: dto.meeting_id ?? null,
    participants: [],
    project: (dto.project_id && projectNames.get(dto.project_id)) || null,
  };
}

const toTask = (dto: CalendarTaskDto): CalendarTask => ({
  id: dto.id,
  title: dto.title,
  due_at: null,
  completed: dto.completed,
  meeting: dto.meeting_title,
  meeting_at: dto.meeting_started_at,
  project: null,
});

// ── Services ─────────────────────────────────────────────────────────────────

export function createHttpProjects(): ProjectsService {
  /** The project with everything its page shows. One request per part, in parallel. */
  async function get(id: string): Promise<Project> {
    // ponytail: six requests per load (and after every change); add a combined endpoint if this gets slow.
    const [project, chats, files, folders, members, contacts] = await Promise.all([
      requestJson<ProjectDto>(projectPath(id)),
      requestJson<ProjectChatDto[]>(projectPath(id, '/chats')),
      requestJson<ProjectFileDto[]>(projectPath(id, '/files')),
      requestJson<FolderDto[]>(projectPath(id, '/folders')),
      requestJson<MemberDto[]>(projectPath(id, '/members')),
      requestJson<ProjectContactDto[]>(projectPath(id, '/contacts')),
    ]);
    return {
      ...toSummary(project),
      chat_count: chats.length,
      file_count: files.length,
      instructions: project.instructions ?? '',
      chats: chats.map((c) => ({ id: c.sessionId, title: c.title, preview: '', updated_at: utc(c.updatedAt || c.createdAt), server: true })),
      sources: [],
      files: files.map(toFile),
      folders: folders.map((f) => ({ id: f.id, name: f.name })),
      members: members.map((m) => ({ id: m.user_id, name: m.name || m.email, email: m.email || null, role: m.role })),
      contacts: contacts.map((c) => ({
        id: c.contact_id,
        name: c.full_name,
        detail: [c.position, c.company].filter(Boolean).join(', '),
        email: c.email ?? null,
      })),
    };
  }
  /** Runs a change, then returns the project as the backend now has it. */
  const then = async (id: string, change: Promise<unknown>) => {
    await change;
    return get(id);
  };
  const send = (path: string, method: string, body?: unknown) => request(path, { method, body });

  return {
    async list() {
      return (await requestJson<ProjectDto[]>('/projects')).map(toSummary);
    },
    get,
    async create(body) {
      return toSummary(await requestJson<ProjectDto>('/projects', { method: 'POST', body }));
    },
    rename: (id, name) => then(id, send(projectPath(id), 'PATCH', { name })),
    async remove(id) {
      await send(projectPath(id), 'DELETE');
    },
    saveInstructions: (id, instructions) => then(id, send(projectPath(id), 'PATCH', { instructions })),
    saveSummary: (id, summary) => then(id, send(projectPath(id), 'PATCH', { summary })),
    // The backend already knows which project a chat belongs to (set when it was created): just reload.
    linkChat: (projectId) => get(projectId),
    renameChat: (projectId, chatId, title) => then(projectId, send(projectPath(projectId, `/chats/${enc(chatId)}`), 'PATCH', { title })),
    deleteChat: (projectId, chatId) => then(projectId, send(projectPath(projectId, `/chats/${enc(chatId)}`), 'DELETE')),
    addMember: (projectId, { email }) => then(projectId, send(projectPath(projectId, '/members'), 'POST', { email })),
    removeMember: (projectId, memberId) => then(projectId, send(projectPath(projectId, `/members/${enc(memberId)}`), 'DELETE')),
    linkContact: (projectId, contactId) => then(projectId, send(projectPath(projectId, '/contacts'), 'POST', { contact_id: contactId })),
    unlinkContact: (projectId, contactId) => then(projectId, send(projectPath(projectId, `/contacts/${enc(contactId)}`), 'DELETE')),
    createFolder: (projectId, name) => then(projectId, send(projectPath(projectId, '/folders'), 'POST', { name })),
    renameFolder: (projectId, folderId, name) => then(projectId, send(projectPath(projectId, `/folders/${enc(folderId)}`), 'PATCH', { name })),
    deleteFolder: (projectId, folderId) => then(projectId, send(projectPath(projectId, `/folders/${enc(folderId)}`), 'DELETE')),
    uploadFile(projectId, file, folderId) {
      const form = new FormData();
      form.append('file', file, file.name);
      if (folderId) form.append('folder_id', folderId);
      return then(projectId, send(projectPath(projectId, '/files'), 'POST', form));
    },
    moveFile: (projectId, fileId, folderId) => then(projectId, send(projectPath(projectId, `/files/${enc(fileId)}`), 'PATCH', { folder_id: folderId })),
    deleteFile: (projectId, fileId) => then(projectId, send(projectPath(projectId, `/files/${enc(fileId)}`), 'DELETE')),
    async fileDownloadUrl(projectId, fileId) {
      return (await requestJson<{ url: string; expires_in: number }>(projectPath(projectId, `/files/${enc(fileId)}/download`))).url;
    },
  };
}

export function createHttpCalendar(): CalendarService {
  /** Project names for the events that belong to one. The calendar still loads if this fails. */
  const projectNames = async () => {
    try {
      return new Map((await requestJson<ProjectDto[]>('/projects')).map((p) => [p.id, p.name]));
    } catch {
      return new Map<string, string>();
    }
  };
  const events = async (path: string) => {
    const [items, names] = await Promise.all([requestJson<CalendarEventDto[]>(path), projectNames()]);
    return items.map((e) => toEvent(e, names));
  };
  return {
    events: () => events('/calendar/events?limit=500'),
    upcoming: () => events('/calendar/events/upcoming'),
    async event(id) {
      return toEvent(await requestJson<CalendarEventDto>(`/calendar/events/${enc(id)}`), new Map());
    },
    async tasks() {
      return (await requestJson<CalendarTaskDto[]>('/calendar/tasks')).map(toTask);
    },
    async setTaskCompleted(id, completed) {
      // A task's id is "<meeting id>:<index of the action item>"; it is ticked on the meeting itself.
      const cut = id.lastIndexOf(':');
      const meetingId = id.slice(0, cut);
      const index = Number(id.slice(cut + 1));
      const meeting = await requestJson<MeetingDto>(`/meetings/${enc(meetingId)}/action-items/${index}`, { method: 'PATCH', body: { completed } });
      const item = meeting.action_items[index];
      return { id, title: item?.text ?? '', due_at: null, completed: item?.completed ?? completed, meeting: meeting.title, meeting_at: meeting.started_at, project: null };
    },
  };
}
