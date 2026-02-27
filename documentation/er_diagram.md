erDiagram

    USER {
        uuid id PK
        string name
        string phone
        decimal wallet_balance
    }

    MATCH {
        uuid id PK
        string team_a_name
        string team_b_name
        string sport
        string status "scheduled | live | completed | abandoned"
        string winning_team "team_a | team_b | null"
        datetime starts_at
        datetime ends_at
    }

    WINDOW {
        uuid id PK
        uuid match_id FK
        int sequence_number
        datetime opens_at
        datetime closes_at
        int duration_seconds
        string status "open | closed | settled | void"
        string resolution_type "match_winner | over_period"
        string winning_team "team_a | team_b | null"
        decimal house_takeout_pct
    }

    POOL {
        uuid id PK
        uuid window_id FK
        string team "team_a | team_b"
        decimal total_amount
        decimal total_weight
    }

    BET {
        uuid id PK
        uuid user_id FK
        uuid window_id FK
        uuid pool_id FK
        string team_picked "team_a | team_b"
        decimal amount
        int placed_at_second
        decimal time_weight
        string status "active | won | lost | refunded"
    }

    SETTLEMENT {
        uuid id PK
        uuid window_id FK
        decimal total_pool
        decimal house_cut
        decimal distributable_pool
        string outcome "team_a | team_b | void"
        datetime settled_at
    }

    PAYOUT {
        uuid id PK
        uuid settlement_id FK
        uuid bet_id FK
        uuid user_id FK
        decimal weight_share_pct
        decimal gross_payout
        string status "pending | completed | failed"
        datetime paid_at
    }

    WALLET_TRANSACTION {
        uuid id PK
        uuid user_id FK
        uuid bet_id FK "nullable"
        uuid payout_id FK "nullable"
        string type "bet_debit | payout_credit | refund_credit"
        decimal amount
        decimal balance_after
        datetime created_at
    }

    MATCH        ||--o{ WINDOW          : "divided into"
    WINDOW       ||--||  POOL           : "has team_a pool"
    WINDOW       ||--||  POOL           : "has team_b pool"
    WINDOW       ||--o{ BET             : "receives"
    POOL         ||--o{ BET             : "contains"
    USER         ||--o{ BET             : "places"
    WINDOW       ||--||  SETTLEMENT     : "produces"
    SETTLEMENT   ||--o{ PAYOUT          : "generates"
    BET          ||--o|  PAYOUT         : "yields"
    USER         ||--o{ PAYOUT          : "receives"
    USER         ||--o{ WALLET_TRANSACTION : "has"
    BET          ||--o{ WALLET_TRANSACTION : "triggers"
    PAYOUT       ||--o{ WALLET_TRANSACTION : "triggers"