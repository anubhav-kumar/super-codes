defmodule LiveBetting.Repo.Migrations.CreateMatches do
  use Ecto.Migration

  def change do
    create table(:matches) do
      add :team_a_name, :string
      add :team_b_name, :string
      add :sport, :string
      add :status, :string
      add :winning_team, :string
      add :starts_at, :utc_datetime
      add :ends_at, :utc_datetime

      timestamps(type: :utc_datetime)
    end
  end
end
