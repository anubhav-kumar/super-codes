defmodule LiveBetting.Accounts do
  @moduledoc """
  The Accounts context.
  """

  import Ecto.Query, warn: false
  alias LiveBetting.Repo

  alias LiveBetting.Accounts.User

  @doc """
  Returns the list of users.

  ## Examples

      iex> list_users()
      [%User{}, ...]

  """
  def list_users do
    Repo.all(User)
  end

  @doc """
  Gets a single user.

  Raises `Ecto.NoResultsError` if the User does not exist.

  ## Examples

      iex> get_user!(123)
      %User{}

      iex> get_user!(456)
      ** (Ecto.NoResultsError)

  """
  def get_user!(id), do: Repo.get!(User, id)

  @doc """
  Creates a user.

  ## Examples

      iex> create_user(%{field: value})
      {:ok, %User{}}

      iex> create_user(%{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def create_user(attrs) do
    %User{}
    |> User.changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Updates a user.

  ## Examples

      iex> update_user(user, %{field: new_value})
      {:ok, %User{}}

      iex> update_user(user, %{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def update_user(%User{} = user, attrs) do
    user
    |> User.changeset(attrs)
    |> Repo.update()
  end

  @doc """
  Deletes a user.

  ## Examples

      iex> delete_user(user)
      {:ok, %User{}}

      iex> delete_user(user)
      {:error, %Ecto.Changeset{}}

  """
  def delete_user(%User{} = user) do
    Repo.delete(user)
  end

  @doc """
  Returns an `%Ecto.Changeset{}` for tracking user changes.

  ## Examples

      iex> change_user(user)
      %Ecto.Changeset{data: %User{}}

  """
  def change_user(%User{} = user, attrs \\ %{}) do
    User.changeset(user, attrs)
  end

  alias LiveBetting.Accounts.WalletTransaction

  @doc """
  Returns the list of wallet_transactions.

  ## Examples

      iex> list_wallet_transactions()
      [%WalletTransaction{}, ...]

  """
  def list_wallet_transactions do
    Repo.all(WalletTransaction)
  end

  @doc """
  Gets a single wallet_transaction.

  Raises `Ecto.NoResultsError` if the Wallet transaction does not exist.

  ## Examples

      iex> get_wallet_transaction!(123)
      %WalletTransaction{}

      iex> get_wallet_transaction!(456)
      ** (Ecto.NoResultsError)

  """
  def get_wallet_transaction!(id), do: Repo.get!(WalletTransaction, id)

  @doc """
  Creates a wallet_transaction.

  ## Examples

      iex> create_wallet_transaction(%{field: value})
      {:ok, %WalletTransaction{}}

      iex> create_wallet_transaction(%{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def create_wallet_transaction(attrs) do
    %WalletTransaction{}
    |> WalletTransaction.changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Updates a wallet_transaction.

  ## Examples

      iex> update_wallet_transaction(wallet_transaction, %{field: new_value})
      {:ok, %WalletTransaction{}}

      iex> update_wallet_transaction(wallet_transaction, %{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def update_wallet_transaction(%WalletTransaction{} = wallet_transaction, attrs) do
    wallet_transaction
    |> WalletTransaction.changeset(attrs)
    |> Repo.update()
  end

  @doc """
  Deletes a wallet_transaction.

  ## Examples

      iex> delete_wallet_transaction(wallet_transaction)
      {:ok, %WalletTransaction{}}

      iex> delete_wallet_transaction(wallet_transaction)
      {:error, %Ecto.Changeset{}}

  """
  def delete_wallet_transaction(%WalletTransaction{} = wallet_transaction) do
    Repo.delete(wallet_transaction)
  end

  @doc """
  Returns an `%Ecto.Changeset{}` for tracking wallet_transaction changes.

  ## Examples

      iex> change_wallet_transaction(wallet_transaction)
      %Ecto.Changeset{data: %WalletTransaction{}}

  """
  def change_wallet_transaction(%WalletTransaction{} = wallet_transaction, attrs \\ %{}) do
    WalletTransaction.changeset(wallet_transaction, attrs)
  end
end
