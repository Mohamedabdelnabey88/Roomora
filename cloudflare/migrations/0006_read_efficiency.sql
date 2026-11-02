CREATE INDEX IF NOT EXISTS idx_requests_status_requested ON service_requests(status, requested_at);
CREATE INDEX IF NOT EXISTS idx_request_lines_request ON service_request_lines(request_id);
CREATE INDEX IF NOT EXISTS idx_approvals_service_request ON approval_requests(service_request_id);
CREATE INDEX IF NOT EXISTS idx_stays_status_room ON stays(status, room_id);
