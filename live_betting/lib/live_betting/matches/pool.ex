defmodule LiveBetting.Matches.Pool do
  use Ecto.Schema
  import Ecto.Changeset

  schema "pools" do
    field :team, :string
    field :total_amount, :decimal
    field :total_weight, :decimal
    field :window_id, :id

    timestamps(type: :utc_datetime)
  end

  @doc false
  def changeset(pool, attrs) do
    pool
    |> cast(attrs, [:team, :total_amount, :total_weight])
    |> validate_required([:team, :total_amount, :total_weight])
  end
end
