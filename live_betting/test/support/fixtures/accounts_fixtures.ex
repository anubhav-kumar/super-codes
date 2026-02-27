defmodule LiveBetting.AccountsFixtures do
  @moduledoc """
  This module defines test helpers for creating
  entities via the `LiveBetting.Accounts` context.
  """

  @doc """
  Generate a user.
  """
  def user_fixture(attrs \\ %{}) do
    {:ok, user} =
      attrs
      |> Enum.into(%{
        name: "some name",
        phone: "some phone",
        wallet_balance: "120.5"
      })
      |> LiveBetting.Accounts.create_user()

    user
  end

  @doc """
  Generate a wallet_transaction.
  """
  def wallet_transaction_fixture(attrs \\ %{}) do
    {:ok, wallet_transaction} =
      attrs
      |> Enum.into(%{
        amount: "120.5",
        balance_after: "120.5",
        type: "some type"
      })
      |> LiveBetting.Accounts.create_wallet_transaction()

    wallet_transaction
  end
end
