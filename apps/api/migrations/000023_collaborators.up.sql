CREATE TABLE collaborators (
    id                   UUID PRIMARY KEY,
    owner_user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    collaborator_email   VARCHAR(255) NOT NULL,
    collaborator_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    can_edit_links       BOOLEAN NOT NULL DEFAULT false,
    can_edit_products    BOOLEAN NOT NULL DEFAULT false,
    can_edit_design      BOOLEAN NOT NULL DEFAULT false,
    status               VARCHAR(20) NOT NULL DEFAULT 'invited'
                             CHECK (status IN ('invited', 'active', 'revoked')),
    invited_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    accepted_at          TIMESTAMPTZ,
    UNIQUE (owner_user_id, collaborator_email)
);

CREATE INDEX idx_collaborators_collaborator_user_id ON collaborators(collaborator_user_id);
CREATE INDEX idx_collaborators_collaborator_email ON collaborators(collaborator_email);
