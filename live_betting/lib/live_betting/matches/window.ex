defmodule LiveBetting.Matches.Window do
  use Ecto.Schema
  import Ecto.Changeset

  schema "windows" do
    field :sequence_number, :integer
    field :opens_at, :utc_datetime
    field :closes_at, :utc_datetime
    field :duration_seconds, :integer
    field :status, :string
    field :resolution_type, :string
    field :winning_team, :string
    field :house_takeout_pct, :decimal
    field :match_id, :id

    timestamps(type: :utc_datetime)
  end

  @doc false
  def changeset(window, attrs) do
    window
    |> cast(attrs, [:sequence_number, :opens_at, :closes_at, :duration_seconds, :status, :resolution_type, :winning_team, :house_takeout_pct])
    |> validate_required([:sequence_number, :opens_at, :closes_at, :duration_seconds, :status, :resolution_type, :winning_team, :house_takeout_pct])
  end
end
