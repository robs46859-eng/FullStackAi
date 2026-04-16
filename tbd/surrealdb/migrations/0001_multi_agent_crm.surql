-- FULL STACK / command-center
-- SurrealDB migration: multi-agent CRM + outreach schema
-- Apply after selecting your namespace/database, for example:
--   USE NS fullstack DB app;

-- =========================
-- core tenant + identity
-- =========================

DEFINE TABLE workspace SCHEMAFULL;
DEFINE FIELD name ON workspace TYPE string;
DEFINE FIELD slug ON workspace TYPE string ASSERT $value != NONE;
DEFINE FIELD created_at ON workspace TYPE datetime VALUE time::now();
DEFINE INDEX workspace_slug_idx ON workspace COLUMNS slug UNIQUE;

DEFINE TABLE user SCHEMAFULL;
DEFINE FIELD email ON user TYPE string ASSERT string::is::email($value);
DEFINE FIELD name ON user TYPE option<string>;
DEFINE FIELD created_at ON user TYPE datetime VALUE time::now();
DEFINE INDEX user_email_idx ON user COLUMNS email UNIQUE;

DEFINE TABLE workspace_member SCHEMAFULL;
DEFINE FIELD workspace ON workspace_member TYPE record<workspace>;
DEFINE FIELD user ON workspace_member TYPE record<user>;
DEFINE FIELD role ON workspace_member TYPE string ASSERT $value INSIDE ["owner","admin","member","viewer"];
DEFINE FIELD created_at ON workspace_member TYPE datetime VALUE time::now();
DEFINE INDEX workspace_member_unique ON workspace_member COLUMNS workspace, user UNIQUE;

-- =========================
-- billing / plans
-- =========================

DEFINE TABLE plan SCHEMAFULL;
DEFINE FIELD code ON plan TYPE string ASSERT $value INSIDE ["free","solo","agency"];
DEFINE FIELD name ON plan TYPE string;
DEFINE FIELD price_cents ON plan TYPE int;
DEFINE FIELD stripe_price_id ON plan TYPE option<string>;
DEFINE FIELD req_per_day ON plan TYPE int;
DEFINE FIELD white_label ON plan TYPE bool VALUE false;
DEFINE FIELD all_modules ON plan TYPE bool VALUE false;
DEFINE INDEX plan_code_idx ON plan COLUMNS code UNIQUE;

DEFINE TABLE subscription SCHEMAFULL;
DEFINE FIELD workspace ON subscription TYPE record<workspace>;
DEFINE FIELD plan ON subscription TYPE record<plan>;
DEFINE FIELD stripe_customer_id ON subscription TYPE option<string>;
DEFINE FIELD stripe_sub_id ON subscription TYPE option<string>;
DEFINE FIELD status ON subscription TYPE string ASSERT $value INSIDE ["active","past_due","canceled","trialing"];
DEFINE FIELD current_period_end ON subscription TYPE option<datetime>;
DEFINE FIELD updated_at ON subscription TYPE datetime VALUE time::now();

-- =========================
-- api keys / metering
-- =========================

DEFINE TABLE api_key SCHEMAFULL;
DEFINE FIELD workspace ON api_key TYPE record<workspace>;
DEFINE FIELD created_by ON api_key TYPE option<record<user>>;
DEFINE FIELD key_hash ON api_key TYPE string;
DEFINE FIELD active ON api_key TYPE bool VALUE true;
DEFINE FIELD created_at ON api_key TYPE datetime VALUE time::now();
DEFINE INDEX api_key_hash_idx ON api_key COLUMNS key_hash UNIQUE;

DEFINE TABLE usage_log SCHEMAFULL;
DEFINE FIELD workspace ON usage_log TYPE record<workspace>;
DEFINE FIELD user ON usage_log TYPE option<record<user>>;
DEFINE FIELD agent ON usage_log TYPE option<record<agent>>;
DEFINE FIELD module ON usage_log TYPE string ASSERT $value INSIDE ["discover","monitor","convert","crm_ai","automation"];
DEFINE FIELD model ON usage_log TYPE string;
DEFINE FIELD tokens_used ON usage_log TYPE option<int>;
DEFINE FIELD cost_usd ON usage_log TYPE option<number>;
DEFINE FIELD created_at ON usage_log TYPE datetime VALUE time::now();

-- =========================
-- CRM layer
-- =========================

DEFINE TABLE company SCHEMAFULL;
DEFINE FIELD workspace ON company TYPE record<workspace>;
DEFINE FIELD name ON company TYPE string;
DEFINE FIELD website ON company TYPE option<string>;
DEFINE FIELD linkedin_url ON company TYPE option<string>;
DEFINE FIELD industry ON company TYPE option<string>;
DEFINE FIELD employee_band ON company TYPE option<string>;
DEFINE FIELD country ON company TYPE option<string>;
DEFINE FIELD notes ON company TYPE option<string>;
DEFINE FIELD created_at ON company TYPE datetime VALUE time::now();
DEFINE INDEX company_workspace_name_idx ON company COLUMNS workspace, name;

DEFINE TABLE contact SCHEMAFULL;
DEFINE FIELD workspace ON contact TYPE record<workspace>;
DEFINE FIELD company ON contact TYPE option<record<company>>;
DEFINE FIELD first_name ON contact TYPE option<string>;
DEFINE FIELD last_name ON contact TYPE option<string>;
DEFINE FIELD full_name ON contact TYPE string;
DEFINE FIELD email ON contact TYPE option<string>;
DEFINE FIELD phone ON contact TYPE option<string>;
DEFINE FIELD title ON contact TYPE option<string>;
DEFINE FIELD linkedin_url ON contact TYPE option<string>;
DEFINE FIELD status ON contact TYPE string ASSERT $value INSIDE ["lead","qualified","customer","inactive"];
DEFINE FIELD owner ON contact TYPE option<record<user>>;
DEFINE FIELD created_at ON contact TYPE datetime VALUE time::now();
DEFINE INDEX contact_workspace_email_idx ON contact COLUMNS workspace, email UNIQUE;

DEFINE TABLE pipeline SCHEMAFULL;
DEFINE FIELD workspace ON pipeline TYPE record<workspace>;
DEFINE FIELD name ON pipeline TYPE string;
DEFINE FIELD is_default ON pipeline TYPE bool VALUE false;
DEFINE FIELD created_at ON pipeline TYPE datetime VALUE time::now();

DEFINE TABLE pipeline_stage SCHEMAFULL;
DEFINE FIELD pipeline ON pipeline_stage TYPE record<pipeline>;
DEFINE FIELD name ON pipeline_stage TYPE string;
DEFINE FIELD position ON pipeline_stage TYPE int;
DEFINE FIELD win_probability ON pipeline_stage TYPE int ASSERT $value >= 0 AND $value <= 100;
DEFINE INDEX pipeline_stage_pos_idx ON pipeline_stage COLUMNS pipeline, position UNIQUE;

DEFINE TABLE deal SCHEMAFULL;
DEFINE FIELD workspace ON deal TYPE record<workspace>;
DEFINE FIELD company ON deal TYPE option<record<company>>;
DEFINE FIELD primary_contact ON deal TYPE option<record<contact>>;
DEFINE FIELD pipeline ON deal TYPE record<pipeline>;
DEFINE FIELD stage ON deal TYPE record<pipeline_stage>;
DEFINE FIELD name ON deal TYPE string;
DEFINE FIELD amount_cents ON deal TYPE int VALUE 0;
DEFINE FIELD status ON deal TYPE string ASSERT $value INSIDE ["open","won","lost"];
DEFINE FIELD owner ON deal TYPE option<record<user>>;
DEFINE FIELD expected_close_date ON deal TYPE option<datetime>;
DEFINE FIELD created_at ON deal TYPE datetime VALUE time::now();

DEFINE TABLE activity SCHEMAFULL;
DEFINE FIELD workspace ON activity TYPE record<workspace>;
DEFINE FIELD contact ON activity TYPE option<record<contact>>;
DEFINE FIELD company ON activity TYPE option<record<company>>;
DEFINE FIELD deal ON activity TYPE option<record<deal>>;
DEFINE FIELD type ON activity TYPE string ASSERT $value INSIDE ["note","call","email","meeting","task","system"];
DEFINE FIELD subject ON activity TYPE option<string>;
DEFINE FIELD body ON activity TYPE option<string>;
DEFINE FIELD due_at ON activity TYPE option<datetime>;
DEFINE FIELD completed_at ON activity TYPE option<datetime>;
DEFINE FIELD created_by ON activity TYPE option<record<user>>;
DEFINE FIELD created_at ON activity TYPE datetime VALUE time::now();

-- =========================
-- outreach layer
-- =========================

DEFINE TABLE lead_source SCHEMAFULL;
DEFINE FIELD workspace ON lead_source TYPE record<workspace>;
DEFINE FIELD name ON lead_source TYPE string;
DEFINE FIELD type ON lead_source TYPE string ASSERT $value INSIDE ["csv","manual","scrape","api","referral"];
DEFINE FIELD config ON lead_source TYPE option<object>;
DEFINE FIELD created_at ON lead_source TYPE datetime VALUE time::now();

DEFINE TABLE lead_list SCHEMAFULL;
DEFINE FIELD workspace ON lead_list TYPE record<workspace>;
DEFINE FIELD name ON lead_list TYPE string;
DEFINE FIELD source ON lead_list TYPE option<record<lead_source>>;
DEFINE FIELD created_at ON lead_list TYPE datetime VALUE time::now();

DEFINE TABLE lead SCHEMAFULL;
DEFINE FIELD workspace ON lead TYPE record<workspace>;
DEFINE FIELD list ON lead TYPE option<record<lead_list>>;
DEFINE FIELD company ON lead TYPE option<record<company>>;
DEFINE FIELD contact ON lead TYPE option<record<contact>>;
DEFINE FIELD source_url ON lead TYPE option<string>;
DEFINE FIELD raw_payload ON lead TYPE option<object>;
DEFINE FIELD fit_score ON lead TYPE option<number>;
DEFINE FIELD intent_score ON lead TYPE option<number>;
DEFINE FIELD stage ON lead TYPE string ASSERT $value INSIDE ["new","researched","queued","contacted","replied","qualified","disqualified"];
DEFINE FIELD assigned_agent ON lead TYPE option<record<agent>>;
DEFINE FIELD created_at ON lead TYPE datetime VALUE time::now();

DEFINE TABLE campaign SCHEMAFULL;
DEFINE FIELD workspace ON campaign TYPE record<workspace>;
DEFINE FIELD name ON campaign TYPE string;
DEFINE FIELD objective ON campaign TYPE option<string>;
DEFINE FIELD status ON campaign TYPE string ASSERT $value INSIDE ["draft","active","paused","completed"];
DEFINE FIELD dry_run ON campaign TYPE bool VALUE true;
DEFINE FIELD created_at ON campaign TYPE datetime VALUE time::now();

DEFINE TABLE campaign_step SCHEMAFULL;
DEFINE FIELD campaign ON campaign_step TYPE record<campaign>;
DEFINE FIELD position ON campaign_step TYPE int;
DEFINE FIELD channel ON campaign_step TYPE string ASSERT $value INSIDE ["email","linkedin","call","manual"];
DEFINE FIELD delay_days ON campaign_step TYPE int VALUE 0;
DEFINE FIELD template_name ON campaign_step TYPE option<string>;
DEFINE FIELD created_at ON campaign_step TYPE datetime VALUE time::now();
DEFINE INDEX campaign_step_pos_idx ON campaign_step COLUMNS campaign, position UNIQUE;

DEFINE TABLE message_draft SCHEMAFULL;
DEFINE FIELD workspace ON message_draft TYPE record<workspace>;
DEFINE FIELD campaign ON message_draft TYPE option<record<campaign>>;
DEFINE FIELD lead ON message_draft TYPE option<record<lead>>;
DEFINE FIELD contact ON message_draft TYPE option<record<contact>>;
DEFINE FIELD channel ON message_draft TYPE string ASSERT $value INSIDE ["email","linkedin"];
DEFINE FIELD subject ON message_draft TYPE option<string>;
DEFINE FIELD body ON message_draft TYPE string;
DEFINE FIELD status ON message_draft TYPE string ASSERT $value INSIDE ["draft","approved","rejected","sent"];
DEFINE FIELD generated_by_agent ON message_draft TYPE option<record<agent>>;
DEFINE FIELD approved_by ON message_draft TYPE option<record<user>>;
DEFINE FIELD created_at ON message_draft TYPE datetime VALUE time::now();

DEFINE TABLE outbound_message SCHEMAFULL;
DEFINE FIELD workspace ON outbound_message TYPE record<workspace>;
DEFINE FIELD campaign ON outbound_message TYPE option<record<campaign>>;
DEFINE FIELD lead ON outbound_message TYPE option<record<lead>>;
DEFINE FIELD contact ON outbound_message TYPE option<record<contact>>;
DEFINE FIELD draft ON outbound_message TYPE option<record<message_draft>>;
DEFINE FIELD channel ON outbound_message TYPE string ASSERT $value INSIDE ["email","linkedin"];
DEFINE FIELD provider ON outbound_message TYPE option<string>;
DEFINE FIELD external_id ON outbound_message TYPE option<string>;
DEFINE FIELD status ON outbound_message TYPE string ASSERT $value INSIDE ["queued","sent","delivered","opened","clicked","replied","bounced","failed"];
DEFINE FIELD sent_at ON outbound_message TYPE option<datetime>;
DEFINE FIELD provider_payload ON outbound_message TYPE option<object>;
DEFINE FIELD created_at ON outbound_message TYPE datetime VALUE time::now();

-- =========================
-- multi-agent layer
-- =========================

DEFINE TABLE agent SCHEMAFULL;
DEFINE FIELD workspace ON agent TYPE record<workspace>;
DEFINE FIELD name ON agent TYPE string;
DEFINE FIELD kind ON agent TYPE string ASSERT $value INSIDE ["discoverer","researcher","writer","reviewer","scheduler","closer","monitor"];
DEFINE FIELD model ON agent TYPE string;
DEFINE FIELD system_prompt ON agent TYPE option<string>;
DEFINE FIELD active ON agent TYPE bool VALUE true;
DEFINE FIELD created_at ON agent TYPE datetime VALUE time::now();

DEFINE TABLE agent_thread SCHEMAFULL;
DEFINE FIELD workspace ON agent_thread TYPE record<workspace>;
DEFINE FIELD lead ON agent_thread TYPE option<record<lead>>;
DEFINE FIELD campaign ON agent_thread TYPE option<record<campaign>>;
DEFINE FIELD subject ON agent_thread TYPE string;
DEFINE FIELD status ON agent_thread TYPE string ASSERT $value INSIDE ["open","closed","error"];
DEFINE FIELD created_at ON agent_thread TYPE datetime VALUE time::now();

DEFINE TABLE agent_message SCHEMAFULL;
DEFINE FIELD workspace ON agent_message TYPE record<workspace>;
DEFINE FIELD thread ON agent_message TYPE record<agent_thread>;
DEFINE FIELD agent ON agent_message TYPE option<record<agent>>;
DEFINE FIELD role ON agent_message TYPE string ASSERT $value INSIDE ["system","user","assistant","tool"];
DEFINE FIELD content ON agent_message TYPE string;
DEFINE FIELD metadata ON agent_message TYPE option<object>;
DEFINE FIELD created_at ON agent_message TYPE datetime VALUE time::now();

DEFINE TABLE agent_task SCHEMAFULL;
DEFINE FIELD workspace ON agent_task TYPE record<workspace>;
DEFINE FIELD thread ON agent_task TYPE option<record<agent_thread>>;
DEFINE FIELD lead ON agent_task TYPE option<record<lead>>;
DEFINE FIELD campaign ON agent_task TYPE option<record<campaign>>;
DEFINE FIELD assigned_to ON agent_task TYPE option<record<agent>>;
DEFINE FIELD type ON agent_task TYPE string ASSERT $value INSIDE ["discover","research","score","draft","review","schedule","send","monitor"];
DEFINE FIELD input ON agent_task TYPE option<object>;
DEFINE FIELD output ON agent_task TYPE option<object>;
DEFINE FIELD status ON agent_task TYPE string ASSERT $value INSIDE ["queued","running","completed","failed","canceled"];
DEFINE FIELD priority ON agent_task TYPE int VALUE 50;
DEFINE FIELD error ON agent_task TYPE option<string>;
DEFINE FIELD created_at ON agent_task TYPE datetime VALUE time::now();
DEFINE FIELD updated_at ON agent_task TYPE datetime VALUE time::now();

DEFINE TABLE tool_run SCHEMAFULL;
DEFINE FIELD workspace ON tool_run TYPE record<workspace>;
DEFINE FIELD task ON tool_run TYPE option<record<agent_task>>;
DEFINE FIELD agent ON tool_run TYPE option<record<agent>>;
DEFINE FIELD tool_name ON tool_run TYPE string;
DEFINE FIELD input ON tool_run TYPE option<object>;
DEFINE FIELD output ON tool_run TYPE option<object>;
DEFINE FIELD status ON tool_run TYPE string ASSERT $value INSIDE ["started","completed","failed"];
DEFINE FIELD created_at ON tool_run TYPE datetime VALUE time::now();

-- =========================
-- memory + retrieval
-- =========================

DEFINE TABLE memory SCHEMAFULL;
DEFINE FIELD workspace ON memory TYPE record<workspace>;
DEFINE FIELD lead ON memory TYPE option<record<lead>>;
DEFINE FIELD contact ON memory TYPE option<record<contact>>;
DEFINE FIELD company ON memory TYPE option<record<company>>;
DEFINE FIELD source_task ON memory TYPE option<record<agent_task>>;
DEFINE FIELD category ON memory TYPE string ASSERT $value INSIDE ["fact","summary","objection","intent","research","policy"];
DEFINE FIELD content ON memory TYPE string;
DEFINE FIELD confidence ON memory TYPE option<number>;
DEFINE FIELD created_at ON memory TYPE datetime VALUE time::now();

DEFINE TABLE knowledge_document SCHEMAFULL;
DEFINE FIELD workspace ON knowledge_document TYPE record<workspace>;
DEFINE FIELD title ON knowledge_document TYPE string;
DEFINE FIELD source_type ON knowledge_document TYPE string ASSERT $value INSIDE ["url","pdf","note","csv","manual"];
DEFINE FIELD source_ref ON knowledge_document TYPE option<string>;
DEFINE FIELD content ON knowledge_document TYPE string;
DEFINE FIELD created_at ON knowledge_document TYPE datetime VALUE time::now();

DEFINE TABLE embedding_chunk SCHEMAFULL;
DEFINE FIELD workspace ON embedding_chunk TYPE record<workspace>;
DEFINE FIELD document ON embedding_chunk TYPE option<record<knowledge_document>>;
DEFINE FIELD memory_ref ON embedding_chunk TYPE option<record<memory>>;
DEFINE FIELD content ON embedding_chunk TYPE string;
DEFINE FIELD embedding ON embedding_chunk TYPE array<float>;
DEFINE FIELD created_at ON embedding_chunk TYPE datetime VALUE time::now();
