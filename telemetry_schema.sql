-- Create app_telemetry_logs table for storing real-time performance & error telemetry
CREATE TABLE IF NOT EXISTS public.app_telemetry_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    user_id UUID,
    portfolio_id TEXT,
    event_type TEXT NOT NULL,
    action_name TEXT NOT NULL,
    duration_ms DOUBLE PRECISION,
    status TEXT NOT NULL,
    error_message TEXT,
    metadata JSONB
);

-- Enable RLS (Row Level Security)
ALTER TABLE public.app_telemetry_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert telemetry logs
CREATE POLICY "Users can insert telemetry logs" 
ON public.app_telemetry_logs 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Allow authenticated users to read telemetry logs
CREATE POLICY "Users can read telemetry logs" 
ON public.app_telemetry_logs 
FOR SELECT 
TO authenticated 
USING (true);

-- Indexes for high-speed queries
CREATE INDEX IF NOT EXISTS idx_telemetry_created_at ON public.app_telemetry_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_event_type ON public.app_telemetry_logs (event_type);
