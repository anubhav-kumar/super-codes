defmodule LiveBetting.Betting.Settlement do
  use Ecto.Schema
  import Ecto.Changeset

  schema "settlements" do
    field :total_pool, :decimal
    field :house_cut, :decimal
    field :distributable_pool, :decimal
    field :outcome, :string
    field :settled_at, :utc_datetime
    field :window_id, :id

    timestamps(type: :utc_datetime)
  end

  @doc false
  def changeset(settlement, attrs) do
    settlement
    |> cast(attrs, [:total_pool, :house_cut, :distributable_pool, :outcome, :settled_at])
    |> validate_required([:total_pool, :house_cut, :distributable_pool, :outcome, :settled_at])
  end
end
