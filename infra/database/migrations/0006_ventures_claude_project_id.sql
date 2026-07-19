-- Optional Claude Chat Project UUID per Venture (Idea). Used by the web app
-- to deep-link founders back to the Project they use for MCP module work.
alter table ventures
  add column claude_project_id uuid null;
