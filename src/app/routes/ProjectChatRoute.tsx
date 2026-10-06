import ProjectsRoute from './ProjectsRoute';

/** A chat inside a project: `/projects/:projectId/new`, `/projects/:projectId/c/:conversationId`. */
export default function ProjectChatRoute() {
  return <ProjectsRoute chat />;
}
