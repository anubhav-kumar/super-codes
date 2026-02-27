defmodule LiveBetting.Repo.Migrations.CreateSettlements do
  use Ecto.Migration

  def change do
    create table(:settlements) do
      add :total_pool, :decimal
      add :house_cut, :decimal
      add :distributable_pool, :decimal
      add :outcome, :string
      add :settled_at, :utc_datetime
      add :window_id, references(:windows, on_delete: :nothing)

      timestamps(type: :utc_datetime)
    end

    create index(:settlements, [:window_id])
  end
end
