defmodule LiveBetting.Accounts.WalletTransaction do
  use Ecto.Schema
  import Ecto.Changeset

  schema "wallet_transactions" do
    field :type, :string
    field :amount, :decimal
    field :balance_after, :decimal
    field :user_id, :id
    field :bet_id, :id
    field :payout_id, :id

    timestamps(type: :utc_datetime)
  end

  @doc false
  def changeset(wallet_transaction, attrs) do
    wallet_transaction
    |> cast(attrs, [:type, :amount, :balance_after])
    |> validate_required([:type, :amount, :balance_after])
  end
end
