-- Additive: support the organization/store inbox ordering.
create index conversations_inbox_order on conversations(organization_id,store_id,updated_at desc,id);
