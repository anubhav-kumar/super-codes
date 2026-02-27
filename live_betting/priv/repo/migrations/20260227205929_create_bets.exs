defmodule LiveBetting.Repo.Migrations.CreateBets do
  use Ecto.Migration

  def change do
    create table(:bets) do
      add :team_picked, :string
      add :amount, :decimal
      add :placed_at_second, :integer
      add :time_weight, :decimal
      add :status, :string
      add :user_id, references(:users, on_delete: :nothing)
      add :window_id, references(:windows, on_delete: :nothing)
      add :pool_id, references(:pools, on_delete: :nothing)

      timestamps(type: :utc_datetime)
    end

    create index(:bets, [:user_id])
    create index(:bets, [:window_id])
    create index(:bets, [:pool_id])
  end
end
