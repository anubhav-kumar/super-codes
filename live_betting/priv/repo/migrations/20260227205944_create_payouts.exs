defmodule LiveBetting.Repo.Migrations.CreatePayouts do
  use Ecto.Migration

  def change do
    create table(:payouts) do
      add :weight_share_pct, :decimal
      add :gross_payout, :decimal
      add :status, :string
      add :paid_at, :utc_datetime
      add :settlement_id, references(:settlements, on_delete: :nothing)
      add :bet_id, references(:bets, on_delete: :nothing)
      add :user_id, references(:users, on_delete: :nothing)

      timestamps(type: :utc_datetime)
    end

    create index(:payouts, [:settlement_id])
    create index(:payouts, [:bet_id])
    create index(:payouts, [:user_id])
  end
end
