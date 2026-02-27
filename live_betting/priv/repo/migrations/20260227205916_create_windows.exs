defmodule LiveBetting.Repo.Migrations.CreateWindows do
  use Ecto.Migration

  def change do
    create table(:windows) do
      add :sequence_number, :integer
      add :opens_at, :utc_datetime
      add :closes_at, :utc_datetime
      add :duration_seconds, :integer
      add :status, :string
      add :resolution_type, :string
      add :winning_team, :string
      add :house_takeout_pct, :decimal
      add :match_id, references(:matches, on_delete: :nothing)

      timestamps(type: :utc_datetime)
    end

    create index(:windows, [:match_id])
  end
end
