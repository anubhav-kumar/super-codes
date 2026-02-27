defmodule LiveBetting.Matches.Match do
  use Ecto.Schema
  import Ecto.Changeset

  schema "matches" do
    field :team_a_name, :string
    field :team_b_name, :string
    field :sport, :string
    field :status, :string
    field :winning_team, :string
    field :starts_at, :utc_datetime
    field :ends_at, :utc_datetime

    timestamps(type: :utc_datetime)
  end

  @doc false
  def changeset(match, attrs) do
    match
    |> cast(attrs, [:team_a_name, :team_b_name, :sport, :status, :winning_team, :starts_at, :ends_at])
    |> validate_required([:team_a_name, :team_b_name, :sport, :status, :winning_team, :starts_at, :ends_at])
  end
end
