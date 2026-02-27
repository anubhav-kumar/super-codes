defmodule LiveBetting.Betting.Bet do
  use Ecto.Schema
  import Ecto.Changeset

  schema "bets" do
    field :team_picked, :string
    field :amount, :decimal
    field :placed_at_second, :integer
    field :time_weight, :decimal
    field :status, :string
    field :user_id, :id
    field :window_id, :id
    field :pool_id, :id

    timestamps(type: :utc_datetime)
  end

  @doc false
  def changeset(bet, attrs) do
    bet
    |> cast(attrs, [:team_picked, :amount, :placed_at_second, :time_weight, :status])
    |> validate_required([:team_picked, :amount, :placed_at_second, :time_weight, :status])
  end
end
