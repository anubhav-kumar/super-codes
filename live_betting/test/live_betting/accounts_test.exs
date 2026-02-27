defmodule LiveBetting.AccountsTest do
  use LiveBetting.DataCase

  alias LiveBetting.Accounts

  describe "users" do
    alias LiveBetting.Accounts.User

    import LiveBetting.AccountsFixtures

    @invalid_attrs %{name: nil, phone: nil, wallet_balance: nil}

    test "list_users/0 returns all users" do
      user = user_fixture()
      assert Accounts.list_users() == [user]
    end

    test "get_user!/1 returns the user with given id" do
      user = user_fixture()
      assert Accounts.get_user!(user.id) == user
    end

    test "create_user/1 with valid data creates a user" do
      valid_attrs = %{name: "some name", phone: "some phone", wallet_balance: "120.5"}

      assert {:ok, %User{} = user} = Accounts.create_user(valid_attrs)
      assert user.name == "some name"
      assert user.phone == "some phone"
      assert user.wallet_balance == Decimal.new("120.5")
    end

    test "create_user/1 with invalid data returns error changeset" do
      assert {:error, %Ecto.Changeset{}} = Accounts.create_user(@invalid_attrs)
    end

    test "update_user/2 with valid data updates the user" do
      user = user_fixture()
      update_attrs = %{name: "some updated name", phone: "some updated phone", wallet_balance: "456.7"}

      assert {:ok, %User{} = user} = Accounts.update_user(user, update_attrs)
      assert user.name == "some updated name"
      assert user.phone == "some updated phone"
      assert user.wallet_balance == Decimal.new("456.7")
    end

    test "update_user/2 with invalid data returns error changeset" do
      user = user_fixture()
      assert {:error, %Ecto.Changeset{}} = Accounts.update_user(user, @invalid_attrs)
      assert user == Accounts.get_user!(user.id)
    end

    test "delete_user/1 deletes the user" do
      user = user_fixture()
      assert {:ok, %User{}} = Accounts.delete_user(user)
      assert_raise Ecto.NoResultsError, fn -> Accounts.get_user!(user.id) end
    end

    test "change_user/1 returns a user changeset" do
      user = user_fixture()
      assert %Ecto.Changeset{} = Accounts.change_user(user)
    end
  end

  describe "wallet_transactions" do
    alias LiveBetting.Accounts.WalletTransaction

    import LiveBetting.AccountsFixtures

    @invalid_attrs %{type: nil, amount: nil, balance_after: nil}

    test "list_wallet_transactions/0 returns all wallet_transactions" do
      wallet_transaction = wallet_transaction_fixture()
      assert Accounts.list_wallet_transactions() == [wallet_transaction]
    end

    test "get_wallet_transaction!/1 returns the wallet_transaction with given id" do
      wallet_transaction = wallet_transaction_fixture()
      assert Accounts.get_wallet_transaction!(wallet_transaction.id) == wallet_transaction
    end

    test "create_wallet_transaction/1 with valid data creates a wallet_transaction" do
      valid_attrs = %{type: "some type", amount: "120.5", balance_after: "120.5"}

      assert {:ok, %WalletTransaction{} = wallet_transaction} = Accounts.create_wallet_transaction(valid_attrs)
      assert wallet_transaction.type == "some type"
      assert wallet_transaction.amount == Decimal.new("120.5")
      assert wallet_transaction.balance_after == Decimal.new("120.5")
    end

    test "create_wallet_transaction/1 with invalid data returns error changeset" do
      assert {:error, %Ecto.Changeset{}} = Accounts.create_wallet_transaction(@invalid_attrs)
    end

    test "update_wallet_transaction/2 with valid data updates the wallet_transaction" do
      wallet_transaction = wallet_transaction_fixture()
      update_attrs = %{type: "some updated type", amount: "456.7", balance_after: "456.7"}

      assert {:ok, %WalletTransaction{} = wallet_transaction} = Accounts.update_wallet_transaction(wallet_transaction, update_attrs)
      assert wallet_transaction.type == "some updated type"
      assert wallet_transaction.amount == Decimal.new("456.7")
      assert wallet_transaction.balance_after == Decimal.new("456.7")
    end

    test "update_wallet_transaction/2 with invalid data returns error changeset" do
      wallet_transaction = wallet_transaction_fixture()
      assert {:error, %Ecto.Changeset{}} = Accounts.update_wallet_transaction(wallet_transaction, @invalid_attrs)
      assert wallet_transaction == Accounts.get_wallet_transaction!(wallet_transaction.id)
    end

    test "delete_wallet_transaction/1 deletes the wallet_transaction" do
      wallet_transaction = wallet_transaction_fixture()
      assert {:ok, %WalletTransaction{}} = Accounts.delete_wallet_transaction(wallet_transaction)
      assert_raise Ecto.NoResultsError, fn -> Accounts.get_wallet_transaction!(wallet_transaction.id) end
    end

    test "change_wallet_transaction/1 returns a wallet_transaction changeset" do
      wallet_transaction = wallet_transaction_fixture()
      assert %Ecto.Changeset{} = Accounts.change_wallet_transaction(wallet_transaction)
    end
  end
end
