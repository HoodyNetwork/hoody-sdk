// The agent's tool categories (its category table and display order), as the
// Hub groups the Tools editor: GET /tools sends no category, so the Hub keeps this copy, in the agent's display order.
// toolNames.agent.test.ts pins it to the agent's source; a catalogue tool missing here shows under More tools, never dropped.
// Pure data: no React, no requests.

/** The categories in the agent's order; each holds its tools' ids (space separated, as the agent lists them). */
const CATEGORIES = {
  coding: 'read_file read_minified_file write_file write_minified_file edit_file edit_minified_file delete_file bash bash_job_wait grep glob_files lsp_query',
  agents: 'spawn_agent task_output list_tasks ask_question_to_user list_agents read_agent upsert_agent delete_agent reset_agent_to_shipped',
  web: 'web_fetch web_search generate_image',
  todos: 'todo_write todo_read create_todo list_todos read_todo update_todo claim_todo finish_todo append_todo_note delete_todo triage_todos run_todo',
  automation: 'tool_orchestrator list_workflows run_workflow read_workflow upsert_workflow delete_workflow list_hooks upsert_hook delete_hook test_hook propose_cron_entry',
  memory: 'memory_recall memory_smart_search memory_save memory_file_history memory_sessions memory_timeline memory_profile memory_patterns memory_relations memory_graph_query memory_export memory_governance_delete memory_consolidate memory_lessons memory_verify memory_edit',
  logs: 'query_logs read_log_entry log_stats list_log_sources',
  fleet: 'hoody_list_computers hoody_exec_scripts hoody_exec_validate hoody_exec_magic_comments hoody_exec_schedules hoody_exec_logs hoody_exec_monitor hoody_exec_routes hoody_exec_run hoody_exec_packages hoody_exec_templates hoody_exec_state hoody_exec_openapi hoody_exec_sdk hoody_exec_system hoody_exec_aliases hoody_daemon_programs hoody_daemon_control hoody_cron hoody_notify hoody_projects hoody_computer_create hoody_computer_manage hoody_snapshots hoody_computer_settings hoody_proxy_permissions_get hoody_proxy_permissions_set',
} as const;

export type Category = keyof typeof CATEGORIES;
export const CATEGORY_ORDER = Object.keys(CATEGORIES) as Category[];

const BY_TOOL = new Map<string, Category>(CATEGORY_ORDER.flatMap((c) => CATEGORIES[c].split(' ').map((id): [string, Category] => [id, c])));

/** The category of a built-in tool, or null for a tool the Hub's copy does not know. */
export const categoryOf = (tool: string): Category | null => BY_TOOL.get(tool) ?? null;

/** Every tool id the Hub's copy knows, in category order. */
export const KNOWN_TOOLS: readonly string[] = [...BY_TOOL.keys()];
