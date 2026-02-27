defmodule LiveBetting.Betting.Payout do
  use Ecto.Schema
  import Ecto.Changeset

  schema "payouts" do
    field :weight_share_pct, :decimal
    field :gross_payout, :decimal
    field :status, :string
    field :paid_at, :utc_datetime
    field :settlement_id, :id
    field :bet_id, :id
    field :user_id, :id

    timestamps(type: :utc_datetime)
  end

  @doc false
  def changeset(payout, attrs) do
    payout
    |> cast(attrs, [:weight_share_pct, :gross_payout, :status, :paid_at])
    |> validate_required([:weight_share_pct, :gross_payout, :status, :paid_at])
  end
end
