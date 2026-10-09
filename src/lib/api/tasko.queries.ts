import { queryOptions } from "@tanstack/react-query";
import {
  getWorkspaceBySlug,
  listWorkspaces,
  getMyProfile,
  listProjects,
  getProject,
  listTasks,
  listMyTasks,
  listWorkspaceMembers,
  getEstimateRollups,
  getProjectTimeHealth,
  getWorkspaceProjectHealth,
  listAccounts,
  getAccount,
  listContracts,
  getContract,
  getContractFinancials,
  listSprints,
  getSprintMetrics,
  listPhases,
  listMilestones,
  listContractPayments,
  listContractProjects,
  getMyWorkspaceRole,
  listWorkspacePayments,
  getFinanceDashboard,
  listCurrencyRates,
  listOperationsTree,
  listContractChildren,
  listMyPermissions,
  listRoleTemplates,
  listMembersWithRoles,
  listContractServiceLines,
  listWorkspaceHandoffs,
  countPendingHandoffs,
  getHandoff,
  listProjectHourBudget,
  listProjectServiceLines,
  listMilestoneLinks,
  listMemberCostRates,
  listRenewals,
  getEmisor,
  listCommissions,
  getDteConfig,
  listInvoices,
  getInvoice,
} from "@/lib/api/tasko.functions";

const STABLE_CACHE_MS = 5 * 60 * 1000;
const LIST_CACHE_MS = 60 * 1000;

export const profileQO = () =>
  queryOptions({
    queryKey: ["profile"],
    queryFn: () => getMyProfile(),
    staleTime: STABLE_CACHE_MS,
  });

export const workspacesQO = () =>
  queryOptions({
    queryKey: ["workspaces"],
    queryFn: () => listWorkspaces(),
    staleTime: STABLE_CACHE_MS,
  });

export const wsBySlugQO = (slug: string) =>
  queryOptions({
    queryKey: ["ws", slug],
    queryFn: () => getWorkspaceBySlug({ data: { slug } }),
    staleTime: STABLE_CACHE_MS,
  });

export const projectsQO = (workspaceId: string) =>
  queryOptions({
    queryKey: ["projects", workspaceId],
    queryFn: () => listProjects({ data: { workspaceId } }),
    staleTime: LIST_CACHE_MS,
  });

export const projectQO = (projectId: string) =>
  queryOptions({
    queryKey: ["project", projectId],
    queryFn: () => getProject({ data: { projectId } }),
    staleTime: LIST_CACHE_MS,
  });

export const tasksQO = (projectId: string) =>
  queryOptions({
    queryKey: ["tasks", projectId],
    queryFn: () => listTasks({ data: { projectId } }),
    staleTime: 30 * 1000,
  });

export const myTasksQO = (workspaceId?: string) =>
  queryOptions({
    queryKey: ["my-tasks", workspaceId ?? "__all__"],
    queryFn: () =>
      workspaceId ? listMyTasks({ data: { workspaceId } }) : listMyTasks({ data: {} }),
    staleTime: 30 * 1000,
  });

export const membersQO = (workspaceId: string) =>
  queryOptions({
    queryKey: ["members", workspaceId],
    queryFn: () => listWorkspaceMembers({ data: { workspaceId } }),
    staleTime: STABLE_CACHE_MS,
  });

export const rollupsQO = (projectId: string) =>
  queryOptions({
    queryKey: ["rollups", projectId],
    queryFn: () => getEstimateRollups({ data: { projectId } }),
    // Rollups are derived from tasks + time entries. We invalidate them
    // explicitly on the actions that change them; keep the passive
    // staleTime high to avoid the 1000+ refetches seen in Supabase logs.
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

export const projectHealthQO = (projectId: string) =>
  queryOptions({
    queryKey: ["project-health", projectId],
    queryFn: () => getProjectTimeHealth({ data: { projectId } }),
    staleTime: LIST_CACHE_MS,
  });

export const wsProjectHealthQO = (workspaceId: string) =>
  queryOptions({
    queryKey: ["ws-project-health", workspaceId],
    queryFn: () => getWorkspaceProjectHealth({ data: { workspaceId } }),
    staleTime: LIST_CACHE_MS,
  });

export const accountsQO = (workspaceId: string, area?: "operations" | "finance") =>
  queryOptions({
    queryKey: ["accounts", workspaceId, area ?? "all"],
    queryFn: () => listAccounts({ data: { workspaceId, area } }),
    staleTime: LIST_CACHE_MS,
  });

export const accountQO = (accountId: string) =>
  queryOptions({
    queryKey: ["account", accountId],
    queryFn: () => getAccount({ data: { accountId } }),
    staleTime: LIST_CACHE_MS,
  });

export const contractsQO = (workspaceId: string, accountId?: string) =>
  queryOptions({
    queryKey: ["contracts", workspaceId, accountId ?? "all"],
    queryFn: () =>
      listContracts({ data: accountId ? { workspaceId, accountId } : { workspaceId } }),
    staleTime: LIST_CACHE_MS,
  });

export const contractQO = (contractId: string) =>
  queryOptions({
    queryKey: ["contract", contractId],
    queryFn: () => getContract({ data: { contractId } }),
    staleTime: LIST_CACHE_MS,
  });

export const contractFinancialsQO = (contractId: string) =>
  queryOptions({
    queryKey: ["contract-financials", contractId],
    queryFn: () => getContractFinancials({ data: { contractId } }),
    staleTime: LIST_CACHE_MS,
  });

export const sprintsQO = (contractId: string, projectId?: string | null) =>
  queryOptions({
    queryKey: ["sprints", contractId, projectId ?? null],
    queryFn: () => listSprints({ data: { contractId, projectId: projectId ?? null } }),
    staleTime: LIST_CACHE_MS,
  });

export const contractSprintSummaryQO = (contractId: string) =>
  queryOptions({
    queryKey: ["contract-sprint-summary", contractId],
    queryFn: async () => {
      const { getContractSprintSummary } = await import("@/lib/api/operations.functions");
      return getContractSprintSummary({ data: { contractId } });
    },
    staleTime: LIST_CACHE_MS,
  });

export const sprintMetricsQO = (contractId: string, projectId: string) =>
  queryOptions({
    queryKey: ["sprint-metrics", contractId, projectId],
    queryFn: () => getSprintMetrics({ data: { contractId, projectId } }),
    staleTime: 15_000,
  });

export const phasesQO = (projectId: string) =>
  queryOptions({
    queryKey: ["phases", projectId],
    queryFn: () => listPhases({ data: { projectId } }),
    staleTime: LIST_CACHE_MS,
  });

export const milestonesQO = (projectId: string) =>
  queryOptions({
    queryKey: ["milestones", projectId],
    queryFn: () => listMilestones({ data: { projectId } }),
    staleTime: LIST_CACHE_MS,
  });

export const contractPaymentsQO = (contractId: string) =>
  queryOptions({
    queryKey: ["contract-payments", contractId],
    queryFn: () => listContractPayments({ data: { contractId } }),
    staleTime: LIST_CACHE_MS,
  });

export const contractProjectsQO = (contractId: string) =>
  queryOptions({
    queryKey: ["contract-projects", contractId],
    queryFn: () => listContractProjects({ data: { contractId } }),
    staleTime: LIST_CACHE_MS,
  });

export const myWorkspaceRoleQO = (workspaceId: string) =>
  queryOptions({
    queryKey: ["my-ws-role", workspaceId],
    queryFn: () => getMyWorkspaceRole({ data: { workspaceId } }),
    staleTime: STABLE_CACHE_MS,
  });

export const workspacePaymentsQO = (
  workspaceId: string,
  filters?: {
    status?: "scheduled" | "invoiced" | "paid" | "overdue" | "cancelled";
    fromDate?: string;
    toDate?: string;
  },
) =>
  queryOptions({
    queryKey: ["ws-payments", workspaceId, filters ?? {}],
    queryFn: () => listWorkspacePayments({ data: { workspaceId, ...(filters ?? {}) } }),
    staleTime: LIST_CACHE_MS,
  });

export const financeDashboardQO = (workspaceId: string) =>
  queryOptions({
    queryKey: ["finance-dashboard", workspaceId],
    queryFn: () => getFinanceDashboard({ data: { workspaceId } }),
    staleTime: LIST_CACHE_MS,
  });

export const currencyRatesQO = (workspaceId: string) =>
  queryOptions({
    queryKey: ["currency-rates", workspaceId],
    queryFn: () => listCurrencyRates({ data: { workspaceId } }),
    staleTime: LIST_CACHE_MS,
  });

export const latestUfRateQO = (workspaceId: string) =>
  queryOptions({
    queryKey: ["latest-uf-rate", workspaceId],
    queryFn: async () => {
      const { getLatestUfRate } = await import("@/lib/api/finance.functions");
      return getLatestUfRate({ data: { workspaceId } });
    },
    staleTime: 60_000,
  });

export const serviceTypesQO = (workspaceId: string) =>
  queryOptions({
    queryKey: ["service-types", workspaceId],
    queryFn: async () => {
      const { listServiceTypes } = await import("@/lib/api/service-types.functions");
      return listServiceTypes({ data: { workspaceId } });
    },
    staleTime: STABLE_CACHE_MS,
  });

export const partnersQO = (workspaceId: string) =>
  queryOptions({
    queryKey: ["partners", workspaceId],
    queryFn: async () => {
      const { listPartners } = await import("@/lib/api/partners.functions");
      return listPartners({ data: { workspaceId } });
    },
    staleTime: STABLE_CACHE_MS,
  });

export const partnerProjectsQO = (partnerId: string) =>
  queryOptions({
    queryKey: ["partner-projects", partnerId],
    queryFn: async () => {
      const { listPartnerProjects } = await import("@/lib/api/projects.functions");
      return listPartnerProjects({ data: { partnerId } });
    },
    staleTime: LIST_CACHE_MS,
  });

export const asanaWorkspacesQO = () =>
  queryOptions({
    queryKey: ["asana", "workspaces"],
    queryFn: async () => {
      const { listAsanaWorkspaces } = await import("@/lib/api/asana.functions");
      return listAsanaWorkspaces();
    },
    staleTime: STABLE_CACHE_MS,
  });

export const asanaProjectsQO = (workspaceGid: string | undefined) =>
  queryOptions({
    queryKey: ["asana", "projects", workspaceGid ?? ""],
    queryFn: async () => {
      if (!workspaceGid) return [];
      const { listAsanaProjects } = await import("@/lib/api/asana.functions");
      return listAsanaProjects({ data: { workspaceGid } });
    },
    enabled: !!workspaceGid,
    staleTime: LIST_CACHE_MS,
  });

export const taskTypesQO = (workspaceId: string) =>
  queryOptions({
    queryKey: ["task-types", workspaceId],
    queryFn: async () => {
      const { listTaskTypes } = await import("@/lib/api/task-types.functions");
      return listTaskTypes({ data: { workspaceId } });
    },
    staleTime: STABLE_CACHE_MS,
  });

export const taskStatusesQO = (workspaceId: string) =>
  queryOptions({
    queryKey: ["task-statuses", workspaceId],
    queryFn: async () => {
      const { listTaskStatuses } = await import("@/lib/api/task-types.functions");
      return listTaskStatuses({ data: { workspaceId } });
    },
    staleTime: STABLE_CACHE_MS,
  });

export const operationsTreeQO = (workspaceId: string) =>
  queryOptions({
    queryKey: ["operations-tree", workspaceId],
    queryFn: () => listOperationsTree({ data: { workspaceId } }),
    // Sidebar tree — full scan over workspace tasks. Keep it cached
    // for a while so hovering/navigating between projects doesn't
    // re-trigger the heavy aggregation query.
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

export const contractChildrenQO = (contractId: string) =>
  queryOptions({
    queryKey: ["contract-children", contractId],
    queryFn: () => listContractChildren({ data: { contractId } }),
    staleTime: LIST_CACHE_MS,
  });

export const myPermissionsQO = (workspaceId: string) =>
  queryOptions({
    queryKey: ["my-permissions", workspaceId],
    queryFn: () => listMyPermissions({ data: { workspaceId } }),
    staleTime: STABLE_CACHE_MS,
  });

export const roleTemplatesQO = (workspaceId: string) =>
  queryOptions({
    queryKey: ["role-templates", workspaceId],
    queryFn: () => listRoleTemplates({ data: { workspaceId } }),
    staleTime: LIST_CACHE_MS,
  });

export const membersWithRolesQO = (workspaceId: string) =>
  queryOptions({
    queryKey: ["members-with-roles", workspaceId],
    queryFn: () => listMembersWithRoles({ data: { workspaceId } }),
    staleTime: LIST_CACHE_MS,
  });

// ============ V2 / Multiservicio + Handoffs ============

export const contractServiceLinesQO = (contractId: string) =>
  queryOptions({
    queryKey: ["contract-service-lines", contractId],
    queryFn: () => listContractServiceLines({ data: { contractId } }),
    staleTime: LIST_CACHE_MS,
  });

export const handoffsQO = (
  workspaceId: string,
  state?: "pendiente" | "en_planificacion" | "completado",
) =>
  queryOptions({
    queryKey: ["handoffs", workspaceId, state ?? "all"],
    queryFn: () =>
      listWorkspaceHandoffs({ data: state ? { workspaceId, state } : { workspaceId } }),
    staleTime: LIST_CACHE_MS,
  });

export const pendingHandoffsCountQO = (workspaceId: string) =>
  queryOptions({
    queryKey: ["handoffs-pending-count", workspaceId],
    queryFn: () => countPendingHandoffs({ data: { workspaceId } }),
    staleTime: LIST_CACHE_MS,
  });

export const handoffQO = (handoffId: string) =>
  queryOptions({
    queryKey: ["handoff", handoffId],
    queryFn: () => getHandoff({ data: { handoffId } }),
    staleTime: LIST_CACHE_MS,
  });

export const projectHourBudgetQO = (projectId: string) =>
  queryOptions({
    queryKey: ["project-hour-budget", projectId],
    queryFn: () => listProjectHourBudget({ data: { projectId } }),
    staleTime: LIST_CACHE_MS,
  });

export const projectServiceLinesQO = (projectId: string) =>
  queryOptions({
    queryKey: ["project-service-lines", projectId],
    queryFn: () => listProjectServiceLines({ data: { projectId } }),
    staleTime: LIST_CACHE_MS,
  });

export const milestoneLinksQO = (projectId: string) =>
  queryOptions({
    queryKey: ["milestone-links", projectId],
    queryFn: () => listMilestoneLinks({ data: { projectId } }),
    staleTime: LIST_CACHE_MS,
  });

export const memberCostRatesQO = (workspaceId: string) =>
  queryOptions({
    queryKey: ["member-cost-rates", workspaceId],
    queryFn: () => listMemberCostRates({ data: { workspaceId } }),
    staleTime: LIST_CACHE_MS,
  });

export const renewalsQO = (workspaceId: string) =>
  queryOptions({
    queryKey: ["renewals", workspaceId],
    queryFn: () => listRenewals({ data: { workspaceId } }),
    staleTime: LIST_CACHE_MS,
  });

export const emisorQO = (workspaceId: string) =>
  queryOptions({
    queryKey: ["emisor", workspaceId],
    queryFn: () => getEmisor({ data: { workspaceId } }),
    staleTime: LIST_CACHE_MS,
  });

export const commissionsQO = (
  workspaceId: string,
  filters?: { estado?: "pendiente" | "aprobada" | "pagada" | "cancelada"; vendedorId?: string },
) =>
  queryOptions({
    queryKey: ["commissions", workspaceId, filters?.estado ?? "all", filters?.vendedorId ?? "all"],
    queryFn: () =>
      listCommissions({
        data: { workspaceId, estado: filters?.estado, vendedorId: filters?.vendedorId },
      }),
    staleTime: LIST_CACHE_MS,
  });

export const dteConfigQO = (workspaceId: string) =>
  queryOptions({
    queryKey: ["dte-config", workspaceId],
    queryFn: () => getDteConfig({ data: { workspaceId } }),
    // DTE config rarely changes; treat as stable to avoid refetches on nav.
    staleTime: STABLE_CACHE_MS,
  });

export const invoicesQO = (
  workspaceId: string,
  filters?: {
    estado?: "draft" | "scheduled" | "emitted" | "paid" | "cancelled";
    contractId?: string;
    accountId?: string;
    anio?: number;
    mes?: number;
  },
) =>
  queryOptions({
    queryKey: [
      "invoices",
      workspaceId,
      filters?.estado ?? "all",
      filters?.contractId ?? "all",
      filters?.accountId ?? "all",
      filters?.anio ?? "all",
      filters?.mes ?? "all",
    ],
    queryFn: () => listInvoices({ data: { workspaceId, ...filters } }),
    staleTime: LIST_CACHE_MS,
  });

export const invoiceQO = (invoiceId: string) =>
  queryOptions({
    queryKey: ["invoice", invoiceId],
    queryFn: () => getInvoice({ data: { invoiceId } }),
    staleTime: LIST_CACHE_MS,
  });
