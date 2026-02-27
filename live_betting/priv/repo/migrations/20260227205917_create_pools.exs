defmodule LiveBetting.Repo.Migrations.CreatePools do
  use Ecto.Migration

  def change do
    create table(:pools) do
      add :team, :string
      add :total_amount, :decimal
      add :total_weight, :decimal
      add :window_id, references(:windows, on_delete: :nothing)

      timestamps(type: :utc_datetime)
    end

    create index(:pools, [:window_id])
  end
end
