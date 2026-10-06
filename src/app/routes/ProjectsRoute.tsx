import { useEffect } from 'react';
import { useLocation, useParams } from 'react-router';
import { isNotFound } from '@/api';
import { useConversation } from '@/features/conversations';
import { ProjectChatView, ProjectDetailView, ProjectsView, useProject } from '@/features/projects';
import NotFoundRoute from './NotFoundRoute';
import { RoutePanel } from './RoutePanel';

/** `/projects/:projectId/new` and `/projects/:projectId/c/:conversationId`: a chat inside a project. */
function ProjectChatRoute({ projectId, conversationId }: { projectId: string; conversationId?: string }) {
  const location = useLocation();
  const project = useProject(projectId);
  const conversation = useConversation(conversationId);
  const name = project.data?.name;
  const title = conversation.data?.title;
  useEffect(() => {
    document.title = [title, name, 'Lam13'].filter(Boolean).join(' · ');
  }, [title, name]);

  if (project.isError) {
    return isNotFound(project.error) ? (
      <RoutePanel eyebrow="404" title="Project not found." description="This project doesn't exist or is no longer available." />
    ) : (
      <RoutePanel
        eyebrow="Error"
        title="Couldn't load this project."
        description="Check your connection and try again."
        action={{ label: 'Try again', onClick: () => void project.refetch() }}
      />
    );
  }
  if (conversationId && conversation.isError && !conversation.data) {
    if (isNotFound(conversation.error)) return <NotFoundRoute />;
    return (
      <RoutePanel
        eyebrow="Error"
        title="Couldn't load this conversation."
        description="Check your connection and try again."
        action={{ label: 'Try again', onClick: () => void conversation.refetch() }}
      />
    );
  }
  // As in ChatRoute: a new chat keeps its view when it moves to the created conversation's URL.
  const viewKey = (location.state as { viewKey?: string } | null)?.viewKey ?? conversationId ?? `new:${location.key}`;
  return <ProjectChatView key={viewKey} viewKey={viewKey} project={project.data} conversationId={conversationId} conversation={conversation.data} />;
}

/** `/projects` — the list; `/projects/:projectId` — one project's workspace; and its chats (above). */
export default function ProjectsRoute({ chat = false }: { chat?: boolean }) {
  const { projectId, conversationId } = useParams();
  useEffect(() => {
    if (!chat) document.title = 'Projects · Lam13';
  }, [chat]);
  if (!projectId) return <ProjectsView />;
  if (chat) return <ProjectChatRoute projectId={projectId} conversationId={conversationId} />;
  return <ProjectDetailView key={projectId} projectId={projectId} />;
}
