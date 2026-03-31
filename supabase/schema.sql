-- Supabase schema for Seedify
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Seeds table ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seeds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    tags TEXT[] DEFAULT '{}',
    domain TEXT,
    energy TEXT CHECK (energy IN ('Spark', 'Hot', 'Flow', 'Cool')),
    status TEXT DEFAULT 'Seedling' CHECK (status IN ('Seedling', 'Growing', 'Harvested')),
    source TEXT DEFAULT 'manual',
    notion_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Ratings table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ratings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    seed_id UUID REFERENCES seeds(id) ON DELETE CASCADE NOT NULL,
    score INTEGER CHECK (score BETWEEN 1 AND 5) NOT NULL,
    feedback TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, seed_id)
);

-- ── Chat sessions table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    prompt TEXT,
    tools_used TEXT[] DEFAULT '{}',
    status TEXT DEFAULT 'completed',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- ── Chat events table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE NOT NULL,
    kind TEXT NOT NULL,
    name TEXT,
    data TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── API usage table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    model TEXT,
    endpoint TEXT,
    tokens_in INTEGER DEFAULT 0,
    tokens_out INTEGER DEFAULT 0,
    cost_usd DECIMAL(10, 6) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX idx_seeds_user_id ON seeds(user_id);
CREATE INDEX idx_seeds_domain ON seeds(domain);
CREATE INDEX idx_seeds_tags ON seeds USING GIN(tags);
CREATE INDEX idx_seeds_created ON seeds(created_at DESC);
CREATE INDEX idx_ratings_user_id ON ratings(user_id);
CREATE INDEX idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX idx_api_usage_user_id ON api_usage(user_id);
CREATE INDEX idx_api_usage_created ON api_usage(created_at DESC);

-- ── Row Level Security ──────────────────────────────────────────────────────
ALTER TABLE seeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

-- Seeds: users can only see/edit their own
CREATE POLICY "Users can view own seeds" ON seeds
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own seeds" ON seeds
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own seeds" ON seeds
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own seeds" ON seeds
    FOR DELETE USING (auth.uid() = user_id);

-- Ratings: users can only see/edit their own
CREATE POLICY "Users can view own ratings" ON ratings
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ratings" ON ratings
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Chat sessions: users can only see their own
CREATE POLICY "Users can view own sessions" ON chat_sessions
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sessions" ON chat_sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Chat events: users can only see events from their sessions
CREATE POLICY "Users can view own events" ON chat_events
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM chat_sessions
            WHERE chat_sessions.id = chat_events.session_id
            AND chat_sessions.user_id = auth.uid()
        )
    );
CREATE POLICY "Users can insert own events" ON chat_events
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM chat_sessions
            WHERE chat_sessions.id = chat_events.session_id
            AND chat_sessions.user_id = auth.uid()
        )
    );

-- API usage: users can only see their own
CREATE POLICY "Users can view own usage" ON api_usage
    FOR SELECT USING (auth.uid() = user_id);

-- ── Storage buckets ─────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public) VALUES
    ('voice-memos', 'voice-memos', false),
    ('attachments', 'attachments', false)
ON CONFLICT DO NOTHING;

-- Storage policies
CREATE POLICY "Users can upload own voice memos" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'voice-memos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can read own voice memos" ON storage.objects
    FOR SELECT USING (bucket_id = 'voice-memos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload own attachments" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can read own attachments" ON storage.objects
    FOR SELECT USING (bucket_id = 'attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ── Updated_at trigger ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER seeds_updated_at
    BEFORE UPDATE ON seeds
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
