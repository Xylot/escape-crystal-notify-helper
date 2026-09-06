CREATE TABLE oauth_flows (state TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE sessions (id TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE submissions (id TEXT PRIMARY KEY, owner TEXT NOT NULL, fingerprint TEXT NOT NULL, revision TEXT NOT NULL, data TEXT NOT NULL, expires INTEGER NOT NULL, lease INTEGER NOT NULL DEFAULT 0, UNIQUE(owner, fingerprint));
CREATE INDEX submissions_revision ON submissions(owner, revision);
CREATE TABLE limits (id TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
