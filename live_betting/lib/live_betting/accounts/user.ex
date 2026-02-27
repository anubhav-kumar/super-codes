defmodule LiveBetting.Accounts.User do
  use Ecto.Schema
  import Ecto.Changeset

  schema "users" do
    field :name, :string
    field :phone, :string
    field :wallet_balance, :decimal

    timestamps(type: :utc_datetime)
  end

  @doc false
  def changeset(user, attrs) do
    user
    |> cast(attrs, [:name, :phone, :wallet_balance])
    |> validate_required([:name, :phone, :wallet_balance])
  end
end
