import { auth, defineMcp } from "@lovable.dev/mcp-js";
import echoTool from "./tools/echo";
import listWorkspacesTool from "./tools/list-workspaces";
import listMyTasksTool from "./tools/list-my-tasks";
import listProjectsTool from "./tools/list-projects";
import getProjectOverviewTool from "./tools/get-project-overview";
import getTaskDetailsTool from "./tools/get-task-details";
import listSprintsTool from "./tools/list-sprints";
import timeReportTool from "./tools/time-report";
import myTimeSummaryTool from "./tools/my-time-summary";
import createTaskTool from "./tools/create-task";
import updateTaskTool from "./tools/update-task";
import addTaskCommentTool from "./tools/add-task-comment";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "riel-mcp",
  title: "Riel",
  version: "0.5.0",
  instructions:
    "Riel operations agent. Start with `list_workspaces` to get a workspaceId. Then use `list_projects`, `list_sprints` and `get_project_overview` for project and sprint status, estimated vs logged hours; `get_task_details` for the full detail of one task (description, conversation/comments, assignees, hours, attachments); `time_report` for aggregated hours by member/project/client/sprint in a date range; `my_time_summary` and `list_my_tasks` for the signed-in user. Write tools: `create_task` (new task in a project/sprint), `update_task` (title, status, priority, dates, estimated hours, sprint, assignees) and `add_task_comment` (internal by default, optionally visible in the client portal). All tools act as the signed-in user and respect their permissions.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    echoTool,
    listWorkspacesTool,
    listMyTasksTool,
    listProjectsTool,
    listSprintsTool,
    getProjectOverviewTool,
    getTaskDetailsTool,
    timeReportTool,
    myTimeSummaryTool,
    createTaskTool,
    updateTaskTool,
    addTaskCommentTool,
  ],
});
