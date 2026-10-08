import type { ArchiveFile, CalendarEvent, CalendarTask, Project, ProjectChat, ProjectContact, ProjectMember, ProjectSummary } from '@/types/api';
import { ApiError } from '../errors';
import type { CalendarService, ProjectsService } from '../services';
import { clone } from './utils';

/**
 * Sample Projects and Calendar data behind `ProjectsService` / `CalendarService`, used by BOTH adapters
 * until the backend has these routes. Everything is relative to `now`, so the calendar always has a
 * populated "today". Replace with the real services — the UI does not change.
 */

const HOUR = 3600e3;
const DAY = 24 * HOUR;
const MB = 1024 * 1024;

const ago = (now: number, ms: number) => new Date(now - ms).toISOString();

function file(now: number, id: string, name: string, kind: ArchiveFile['kind'], size: number, daysAgo: number, by: string, pages?: number): ArchiveFile {
  return {
    id,
    name,
    kind,
    extension: name.split('.').pop()!.toUpperCase(),
    size_bytes: Math.round(size * MB),
    ...(pages !== undefined && { pages }),
    uploaded_at: ago(now, daysAgo * DAY),
    uploaded_by: by,
    status: 'ready',
  };
}

function createProjects(now: number): Project[] {
  const projects: Omit<Project, 'chat_count' | 'file_count' | 'members' | 'folders' | 'contacts' | 'role'>[] = [
    {
      id: 'water-security',
      name: 'National Water Security Strategy',
      description: 'Baseline, KPI framework and delivery roadmap for the 2030 water security programme.',
      updated_at: ago(now, 2 * HOUR),
      instructions:
        'Write for ministry leadership: lead with the decision, then the evidence. Use the 2022 baseline unless told otherwise, cite the source file for every figure, and flag any KPI without an owner.',
      chats: [],
      sources: [
        { id: 'ws-s0', type: 'file', title: 'Baseline Assessment 2022.pdf', detail: 'PDF · 84 pages', summary: 'The 2022 baseline for supply, demand, network losses and metering coverage by region, with the method used for each figure.' },
        { id: 'ws-s00', type: 'file', title: 'KPI Framework Draft.docx', detail: 'DOCX · 14 pages', summary: 'Five headline indicators with two diagnostic measures each, proposed targets for 2030 and the data source for every KPI.' },
        { id: 'ws-s1', type: 'meeting', title: 'KPI working session', detail: 'Meeting notes · 5 action items', summary: 'Agreed five headline indicators with diagnostic measures underneath, and to test two baseline years before choosing one.' },
        { id: 'ws-s2', type: 'meeting', title: 'Steering committee review', detail: 'Meeting notes · 3 decisions', summary: 'Approved the roadmap phasing, asked for a funding sensitivity analysis, and moved tariff reform to the second year.' },
        { id: 'ws-s3', type: 'contact', title: 'Omar Haddad', detail: 'Programme Director, Water Authority', summary: 'Sponsor of the tariff reform workstream. Prefers a one-page summary before any detailed pack.' },
        { id: 'ws-s6', type: 'contact', title: 'Lena Fischer', detail: 'Policy Advisor, Ministry of Environment', summary: 'Reviews the board narrative and the regulatory implications of each option.' },
        { id: 'ws-s4', type: 'note', title: 'Baseline year decision', detail: 'Note', summary: 'Use 2022 as the baseline year; revisit if the 2023 audit data lands before June.' },
        { id: 'ws-s5', type: 'link', title: 'UN-Water SDG 6 data portal', detail: 'sdg6data.org', summary: 'Reference indicators for SDG 6, used to benchmark the national targets.' },
      ],
      files: [
        file(now, 'ws-f1', 'Water Security Strategy – Board Deck v4.pptx', 'presentation', 18.4, 1, 'Joseph Boutros', 32),
        file(now, 'ws-f2', 'Baseline Assessment 2022.pdf', 'document', 6.2, 4, 'Maya Okafor', 84),
        file(now, 'ws-f3', 'KPI Framework Draft.docx', 'document', 0.9, 5, 'Joseph Boutros', 14),
        file(now, 'ws-f4', 'Steering Committee Update – March.pptx', 'presentation', 11.7, 9, 'Daniel Brandt', 21),
        file(now, 'ws-f5', 'Supply-demand gap chart.png', 'image', 0.6, 9, 'Maya Okafor'),
        file(now, 'ws-f6', 'Network losses by region.png', 'image', 1.1, 12, 'Maya Okafor'),
        file(now, 'ws-f7', 'Tariff Reform Options Paper.pdf', 'document', 2.8, 16, 'Daniel Brandt', 27),
        { ...file(now, 'ws-f8', 'Desalination Capacity Review.pptx', 'presentation', 24.9, 0, 'Joseph Boutros', 40), status: 'processing' },
        file(now, 'ws-f9', 'Workshop whiteboard – levers.jpg', 'image', 3.4, 20, 'Joseph Boutros'),
      ],
    },
    {
      id: 'ai-strategy',
      name: 'National AI Strategy',
      description: 'Vision, capability pillars and governance model for the national AI programme.',
      updated_at: ago(now, 1 * DAY),
      instructions: 'Keep recommendations vendor-neutral. Separate what is decided from what is proposed, and note the owner of each initiative.',
      chats: [],
      sources: [
        { id: 'ai-s1', type: 'meeting', title: 'Governance model workshop', detail: 'Meeting notes · 4 action items', summary: 'Compared a central AI office with a federated model; the group leaned towards a small central office with ministry leads.' },
        { id: 'ai-s3', type: 'contact', title: 'Lena Fischer', detail: 'Policy Advisor, Ministry of Environment', summary: 'Leads the talent pillar interviews and the governance consultation.' },
        { id: 'ai-s2', type: 'note', title: 'Scope', detail: 'Note', summary: 'Public sector adoption first; private-sector incentives in phase two.' },
      ],
      files: [
        file(now, 'ai-f1', 'AI Strategy – Vision & Pillars.pptx', 'presentation', 9.3, 2, 'Joseph Boutros', 18),
        file(now, 'ai-f2', 'Governance Model Options.docx', 'document', 0.4, 6, 'Maya Okafor', 9),
        file(now, 'ai-f3', 'Capability maturity heatmap.png', 'image', 0.8, 7, 'Maya Okafor'),
      ],
    },
    {
      id: 'digital-services',
      name: 'Digital Services KPI Framework',
      description: 'Indicators, targets and reporting cadence for citizen-facing digital services.',
      updated_at: ago(now, 5 * DAY),
      instructions: 'Prefer outcome measures over activity counts. Every KPI needs a baseline, a target and a data source.',
      chats: [],
      sources: [],
      files: [],
    },
  ];
  return projects.map((p) => ({
    ...p,
    role: 'owner' as const,
    chat_count: p.chats.length,
    file_count: p.files.length,
    folders: [],
    members: (MEMBERS[p.id] ?? []).map((m) => ({ ...m })),
    // The sample projects' contacts are the "contact" entries of their sample context.
    contacts: p.sources.filter((s) => s.type === 'contact').map((s): ProjectContact => ({ id: s.id, name: s.title, detail: s.detail, email: null })),
  }));
}

/** What the Archives accept, as the backend does. */
const FILE_KINDS: Record<string, ArchiveFile['kind']> = {
  PDF: 'document',
  DOCX: 'document',
  PPTX: 'presentation',
  PNG: 'image',
  JPG: 'image',
  JPEG: 'image',
  GIF: 'image',
  WEBP: 'image',
};

/**
 * Who each sample project is shared with: the same people who appear as file owners in its Archives and
 * in the calendar's meetings. No email addresses are made up for them.
 */
const person = (id: string, name: string, role: ProjectMember['role'] = 'member'): ProjectMember => ({ id, name, email: null, role });
const MEMBERS: Record<string, ProjectMember[]> = {
  'water-security': [person('m-joseph', 'Joseph Boutros', 'owner'), person('m-maya', 'Maya Okafor'), person('m-daniel', 'Daniel Brandt'), person('m-priya', 'Priya Nair')],
  'ai-strategy': [person('m-joseph', 'Joseph Boutros', 'owner'), person('m-maya', 'Maya Okafor'), person('m-priya', 'Priya Nair')],
  'digital-services': [person('m-joseph', 'Joseph Boutros', 'owner'), person('m-priya', 'Priya Nair')],
};

const CHATS_KEY = 'lam13.projectChats.v1';

/** The project ↔ conversation links kept in this browser (`storage`), if any. Never throws. */
function loadLinks(storage: Storage | undefined): Record<string, ProjectChat[]> {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(CHATS_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, ProjectChat[]>) : {};
  } catch {
    return {};
  }
}

/**
 * `chats`: conversations already in each project (the demo ones, projectChatFixtures.ts). `storage`: where the
 * links made here are kept — the backend has no projects, so which conversation belongs to which project
 * is known only to this browser. Without it they last for the session.
 */
export function createMockProjects({
  now = Date.now,
  respond = () => Promise.resolve(),
  chats = {},
  storage,
  findContact = async () => null,
}: {
  now?: () => number;
  respond?: () => Promise<void>;
  chats?: Record<string, ProjectChat[]>;
  storage?: Storage;
  /** One of the user's own contacts, by id (My Contacts), for linking it to a project. */
  findContact?: (id: string) => Promise<ProjectContact | null>;
} = {}): ProjectsService {
  const projects = createProjects(now());
  /** What was uploaded here, so it can be downloaded again in this session. */
  const uploads = new Map<string, File>();
  let serial = 0;
  const nextId = (prefix: string) => `${prefix}-${now().toString(36)}-${(serial += 1)}`;
  /** The project, after the simulated request, or 404. */
  const open = async (projectId: string) => {
    await respond();
    const project = projects.find((p) => p.id === projectId);
    if (!project) throw new ApiError(404, 'not_found', 'Project not found.');
    return project;
  };
  const saved = (project: Project) => {
    project.chat_count = project.chats.length;
    project.file_count = project.files.length;
    project.updated_at = new Date(now()).toISOString();
    return clone(project);
  };
  const folderOf = (project: Project, folderId: string) => {
    const folder = project.folders.find((f) => f.id === folderId);
    if (!folder) throw new ApiError(404, 'not_found', 'Folder not found.');
    return folder;
  };
  const fileOf = (project: Project, fileId: string) => {
    const file = project.files.find((f) => f.id === fileId);
    if (!file) throw new ApiError(404, 'not_found', 'File not found.');
    return file;
  };
  const taken = (project: Project, name: string, exceptId?: string) => {
    if (project.folders.some((f) => f.name === name && f.id !== exceptId)) throw new ApiError(409, 'conflict', 'A folder with this name already exists in the project.');
  };
  const links = loadLinks(storage);
  for (const project of projects) {
    project.chats = [...(links[project.id] ?? []), ...(chats[project.id] ?? [])];
    project.chat_count = project.chats.length;
  }
  return {
    async list() {
      await respond();
      return projects.map(({ id, name, description, updated_at, chat_count, file_count, role }): ProjectSummary =>
        clone({ id, name, description, updated_at, chat_count, file_count, role }),
      );
    },
    async create({ name, instructions = '', summary = '' }) {
      await respond();
      const project: Project = {
        id: nextId('p'),
        name: name.trim(),
        description: summary,
        updated_at: new Date(now()).toISOString(),
        role: 'owner',
        chat_count: 0,
        file_count: 0,
        instructions,
        chats: [],
        sources: [],
        files: [],
        folders: [],
        members: [{ id: 'm-joseph', name: 'Joseph Boutros', email: null, role: 'owner' }],
        contacts: [],
      };
      projects.unshift(project);
      const { id, description, updated_at, chat_count, file_count, role } = project;
      return clone({ id, name: project.name, description, updated_at, chat_count, file_count, role });
    },
    async rename(id, name) {
      const project = await open(id);
      project.name = name.trim();
      return saved(project);
    },
    async remove(id) {
      const project = await open(id);
      projects.splice(projects.indexOf(project), 1);
    },
    async renameChat(projectId, chatId, title) {
      const project = await open(projectId);
      const chat = project.chats.find((c) => c.id === chatId);
      if (!chat) throw new ApiError(404, 'not_found', 'Conversation not found');
      chat.title = title.trim();
      return saved(project);
    },
    async deleteChat(projectId, chatId) {
      const project = await open(projectId);
      if (!project.chats.some((c) => c.id === chatId)) throw new ApiError(404, 'not_found', 'Conversation not found');
      project.chats = project.chats.filter((c) => c.id !== chatId);
      return saved(project);
    },
    async linkContact(projectId, contactId) {
      const project = await open(projectId);
      const contact = await findContact(contactId);
      if (!contact) throw new ApiError(404, 'not_found', 'Contact not found.');
      if (project.contacts.some((c) => c.id === contact.id)) throw new ApiError(409, 'conflict', 'This contact is already linked to the project.');
      project.contacts = [...project.contacts, contact];
      return saved(project);
    },
    async unlinkContact(projectId, contactId) {
      const project = await open(projectId);
      if (!project.contacts.some((c) => c.id === contactId)) throw new ApiError(404, 'not_found', 'Contact not found in this project.');
      project.contacts = project.contacts.filter((c) => c.id !== contactId);
      return saved(project);
    },
    async createFolder(projectId, name) {
      const project = await open(projectId);
      taken(project, name.trim());
      project.folders = [...project.folders, { id: nextId('fo'), name: name.trim() }].sort((a, b) => a.name.localeCompare(b.name));
      return saved(project);
    },
    async renameFolder(projectId, folderId, name) {
      const project = await open(projectId);
      const folder = folderOf(project, folderId);
      taken(project, name.trim(), folderId);
      folder.name = name.trim();
      return saved(project);
    },
    async deleteFolder(projectId, folderId) {
      const project = await open(projectId);
      folderOf(project, folderId);
      project.folders = project.folders.filter((f) => f.id !== folderId);
      for (const file of project.files) if (file.folder_id === folderId) file.folder_id = null; // its files stay in the project
      return saved(project);
    },
    async uploadFile(projectId, file, folderId) {
      const project = await open(projectId);
      if (folderId) folderOf(project, folderId);
      const extension = (file.name.includes('.') ? file.name.split('.').pop()! : '').toUpperCase();
      const kind = FILE_KINDS[extension];
      if (!kind) throw new ApiError(415, 'unsupported', 'Supported files: PDF, DOCX, PPTX, PNG, JPG, GIF, WEBP.');
      if (file.size === 0) throw new ApiError(400, 'empty', 'The file is empty.');
      const id = nextId('f');
      uploads.set(id, file);
      project.files = [
        {
          id,
          name: file.name,
          kind,
          extension,
          size_bytes: file.size,
          uploaded_at: new Date(now()).toISOString(),
          uploaded_by: 'Joseph Boutros',
          folder_id: folderId ?? null,
          // As the backend: PDFs and images are readable by the assistant; DOCX and PPTX are stored only.
          status: extension === 'DOCX' || extension === 'PPTX' ? 'stored' : 'ready',
        },
        ...project.files,
      ];
      return saved(project);
    },
    async moveFile(projectId, fileId, folderId) {
      const project = await open(projectId);
      const file = fileOf(project, fileId);
      if (folderId) folderOf(project, folderId);
      file.folder_id = folderId;
      return saved(project);
    },
    async deleteFile(projectId, fileId) {
      const project = await open(projectId);
      fileOf(project, fileId);
      project.files = project.files.filter((f) => f.id !== fileId);
      uploads.delete(fileId);
      return saved(project);
    },
    async fileDownloadUrl(projectId, fileId) {
      const project = await open(projectId);
      fileOf(project, fileId);
      const file = uploads.get(fileId);
      // The sample library has no file behind its entries.
      if (!file) throw new ApiError(404, 'not_found', "This sample file can't be downloaded.");
      return URL.createObjectURL(file);
    },
    async linkChat(projectId, chat) {
      await respond();
      const project = projects.find((p) => p.id === projectId);
      if (!project) throw new ApiError(404, 'not_found', 'This project does not exist.');
      if (!project.chats.some((c) => c.id === chat.id)) {
        const linked: ProjectChat = { id: chat.id, title: chat.title, preview: '', updated_at: new Date(now()).toISOString() };
        project.chats = [linked, ...project.chats];
        project.chat_count = project.chats.length;
        try {
          const stored = loadLinks(storage);
          storage?.setItem(CHATS_KEY, JSON.stringify({ ...stored, [projectId]: [linked, ...(stored[projectId] ?? [])] }));
        } catch {
          // Storage unavailable (private mode, quota): the link lasts for this session only.
        }
      }
      return clone(project);
    },
    async get(id) {
      await respond();
      const project = projects.find((p) => p.id === id);
      if (!project) throw new ApiError(404, 'not_found', 'This project does not exist.');
      return clone(project);
    },
    // Demo membership: kept in memory for this session. No invitation, email or permission exists behind it.
    async addMember(projectId, { email, role }) {
      await respond();
      const project = projects.find((p) => p.id === projectId);
      if (!project) throw new ApiError(404, 'not_found', 'This project does not exist.');
      const address = email.trim().toLowerCase();
      if (project.members.some((m) => m.email?.toLowerCase() === address)) throw new ApiError(409, 'conflict', 'This person is already a member of the project.');
      project.members = [...project.members, { id: `m-${now().toString(36)}-${project.members.length}`, name: address, email: address, role }];
      return clone(project);
    },
    async removeMember(projectId, memberId) {
      await respond();
      const project = projects.find((p) => p.id === projectId);
      const member = project?.members.find((m) => m.id === memberId);
      if (!project || !member) throw new ApiError(404, 'not_found', 'This member does not exist.');
      if (member.role === 'owner') throw new ApiError(403, 'forbidden', 'The owner cannot be removed from the project.');
      project.members = project.members.filter((m) => m.id !== memberId);
      return clone(project);
    },
    async saveInstructions(id, instructions) {
      await respond();
      const project = projects.find((p) => p.id === id);
      if (!project) throw new ApiError(404, 'not_found', 'This project does not exist.');
      project.instructions = instructions;
      return clone(project);
    },
    async saveSummary(id, summary) {
      await respond();
      const project = projects.find((p) => p.id === id);
      if (!project) throw new ApiError(404, 'not_found', 'This project does not exist.');
      project.description = summary;
      return clone(project);
    },
  };
}

/** Local midnight of the day `offset` days from `now`. */
function dayStart(now: number, offset: number) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d.getTime();
}

function createCalendar(now: number): { events: CalendarEvent[]; tasks: CalendarTask[] } {
  const at = (day: number, hour: number, minutes = 0) => new Date(dayStart(now, day) + hour * HOUR + minutes * 60e3).toISOString();
  const event = (
    id: string,
    title: string,
    day: number,
    hour: number,
    durationMin: number,
    location: CalendarEvent['location'],
    participants: string[],
    project: string | null = null,
    minutes = 0,
  ): CalendarEvent => ({
    id,
    title,
    starts_at: at(day, hour, minutes),
    ends_at: new Date(new Date(at(day, hour, minutes)).getTime() + durationMin * 60e3).toISOString(),
    location,
    participants,
    project,
  });
  const WATER = 'National Water Security Strategy';
  const AI = 'National AI Strategy';
  return {
    events: [
      event('ev-1', 'KPI working session', 0, 10, 60, 'meet', ['Maya Okafor', 'Daniel Brandt'], WATER),
      event('ev-2', 'Steering committee prep', 0, 14, 45, 'teams', ['Daniel Brandt', 'Priya Nair', 'Omar Haddad'], WATER, 30),
      event('ev-3', 'Governance model workshop', 1, 11, 90, 'zoom', ['Priya Nair', 'Lena Fischer'], AI),
      event('ev-4', 'Weekly strategy sync', 2, 9, 30, 'meet', ['Maya Okafor'], null, 30),
      event('ev-5', 'Tariff reform options review', 3, 15, 60, 'teams', ['Daniel Brandt', 'Omar Haddad'], WATER),
      event('ev-6', 'Board deck dry run', 6, 13, 60, 'in-person', ['Maya Okafor', 'Daniel Brandt', 'Lena Fischer'], WATER),
      event('ev-7', 'Digital services KPI review', 8, 10, 45, 'zoom', ['Priya Nair'], 'Digital Services KPI Framework'),
      event('ev-8', 'Baseline data walkthrough', -1, 16, 45, 'meet', ['Maya Okafor'], WATER),
      event('ev-9', 'AI talent pillar interview', -3, 11, 30, 'zoom', ['Lena Fischer'], AI),
    ],
    tasks: [
      { id: 'tk-1', title: 'Send the revised KPI list to the steering committee', due_at: at(0, 17), completed: false, meeting: 'KPI working session', project: WATER },
      { id: 'tk-2', title: 'Confirm 2022 as the baseline year with finance', due_at: at(0, 12), completed: true, meeting: 'Baseline data walkthrough', project: WATER },
      { id: 'tk-3', title: 'Draft the governance options one-pager', due_at: at(1, 17), completed: false, meeting: 'Governance model workshop', project: AI },
      { id: 'tk-4', title: 'Collect regional network-loss figures', due_at: at(3, 12), completed: false, meeting: 'Tariff reform options review', project: WATER },
      { id: 'tk-5', title: 'Rehearse the board narrative', due_at: at(6, 10), completed: false, meeting: 'Board deck dry run', project: WATER },
      { id: 'tk-6', title: 'Share interview notes with the talent workstream', due_at: at(-2, 17), completed: true, meeting: 'AI talent pillar interview', project: AI },
    ],
  };
}

export function createMockCalendar({ now = Date.now, respond = () => Promise.resolve() } = {}): CalendarService {
  const { events, tasks } = createCalendar(now());
  const starts = (a: CalendarEvent, b: CalendarEvent) => a.starts_at.localeCompare(b.starts_at);
  return {
    async events() {
      await respond();
      return clone(events).sort(starts);
    },
    async upcoming() {
      await respond();
      // From the start of today (the backend's is from this instant): the sample day stays the same all day.
      const from = new Date(dayStart(now(), 0)).toISOString();
      return clone(events.filter((e) => e.starts_at >= from)).sort(starts);
    },
    async event(id) {
      await respond();
      const event = events.find((e) => e.id === id);
      if (!event) throw new ApiError(404, 'not_found', 'Event not found.');
      return clone(event);
    },
    async tasks() {
      await respond();
      return clone(tasks);
    },
    async setTaskCompleted(id, completed) {
      await respond();
      const task = tasks.find((t) => t.id === id);
      if (!task) throw new ApiError(404, 'not_found', 'This task does not exist.');
      task.completed = completed;
      return clone(task);
    },
  };
}
