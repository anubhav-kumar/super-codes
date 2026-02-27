defmodule LiveBetting.Betting do
  @moduledoc """
  The Betting context.
  """

  import Ecto.Query, warn: false
  alias LiveBetting.Repo

  alias LiveBetting.Betting.Bet

  @doc """
  Returns the list of bets.

  ## Examples

      iex> list_bets()
      [%Bet{}, ...]

  """
  def list_bets do
    Repo.all(Bet)
  end

  @doc """
  Gets a single bet.

  Raises `Ecto.NoResultsError` if the Bet does not exist.

  ## Examples

      iex> get_bet!(123)
      %Bet{}

      iex> get_bet!(456)
      ** (Ecto.NoResultsError)

  """
  def get_bet!(id), do: Repo.get!(Bet, id)

  @doc """
  Creates a bet.

  ## Examples

      iex> create_bet(%{field: value})
      {:ok, %Bet{}}

      iex> create_bet(%{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def create_bet(attrs) do
    %Bet{}
    |> Bet.changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Updates a bet.

  ## Examples

      iex> update_bet(bet, %{field: new_value})
      {:ok, %Bet{}}

      iex> update_bet(bet, %{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def update_bet(%Bet{} = bet, attrs) do
    bet
    |> Bet.changeset(attrs)
    |> Repo.update()
  end

  @doc """
  Deletes a bet.

  ## Examples

      iex> delete_bet(bet)
      {:ok, %Bet{}}

      iex> delete_bet(bet)
      {:error, %Ecto.Changeset{}}

  """
  def delete_bet(%Bet{} = bet) do
    Repo.delete(bet)
  end

  @doc """
  Returns an `%Ecto.Changeset{}` for tracking bet changes.

  ## Examples

      iex> change_bet(bet)
      %Ecto.Changeset{data: %Bet{}}

  """
  def change_bet(%Bet{} = bet, attrs \\ %{}) do
    Bet.changeset(bet, attrs)
  end

  alias LiveBetting.Betting.Payout

  @doc """
  Returns the list of payouts.

  ## Examples

      iex> list_payouts()
      [%Payout{}, ...]

  """
  def list_payouts do
    Repo.all(Payout)
  end

  @doc """
  Gets a single payout.

  Raises `Ecto.NoResultsError` if the Payout does not exist.

  ## Examples

      iex> get_payout!(123)
      %Payout{}

      iex> get_payout!(456)
      ** (Ecto.NoResultsError)

  """
  def get_payout!(id), do: Repo.get!(Payout, id)

  @doc """
  Creates a payout.

  ## Examples

      iex> create_payout(%{field: value})
      {:ok, %Payout{}}

      iex> create_payout(%{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def create_payout(attrs) do
    %Payout{}
    |> Payout.changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Updates a payout.

  ## Examples

      iex> update_payout(payout, %{field: new_value})
      {:ok, %Payout{}}

      iex> update_payout(payout, %{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def update_payout(%Payout{} = payout, attrs) do
    payout
    |> Payout.changeset(attrs)
    |> Repo.update()
  end

  @doc """
  Deletes a payout.

  ## Examples

      iex> delete_payout(payout)
      {:ok, %Payout{}}

      iex> delete_payout(payout)
      {:error, %Ecto.Changeset{}}

  """
  def delete_payout(%Payout{} = payout) do
    Repo.delete(payout)
  end

  @doc """
  Returns an `%Ecto.Changeset{}` for tracking payout changes.

  ## Examples

      iex> change_payout(payout)
      %Ecto.Changeset{data: %Payout{}}

  """
  def change_payout(%Payout{} = payout, attrs \\ %{}) do
    Payout.changeset(payout, attrs)
  end

  alias LiveBetting.Betting.Settlement

  @doc """
  Returns the list of settlements.

  ## Examples

      iex> list_settlements()
      [%Settlement{}, ...]

  """
  def list_settlements do
    Repo.all(Settlement)
  end

  @doc """
  Gets a single settlement.

  Raises `Ecto.NoResultsError` if the Settlement does not exist.

  ## Examples

      iex> get_settlement!(123)
      %Settlement{}

      iex> get_settlement!(456)
      ** (Ecto.NoResultsError)

  """
  def get_settlement!(id), do: Repo.get!(Settlement, id)

  @doc """
  Creates a settlement.

  ## Examples

      iex> create_settlement(%{field: value})
      {:ok, %Settlement{}}

      iex> create_settlement(%{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def create_settlement(attrs) do
    %Settlement{}
    |> Settlement.changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Updates a settlement.

  ## Examples

      iex> update_settlement(settlement, %{field: new_value})
      {:ok, %Settlement{}}

      iex> update_settlement(settlement, %{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def update_settlement(%Settlement{} = settlement, attrs) do
    settlement
    |> Settlement.changeset(attrs)
    |> Repo.update()
  end

  @doc """
  Deletes a settlement.

  ## Examples

      iex> delete_settlement(settlement)
      {:ok, %Settlement{}}

      iex> delete_settlement(settlement)
      {:error, %Ecto.Changeset{}}

  """
  def delete_settlement(%Settlement{} = settlement) do
    Repo.delete(settlement)
  end

  @doc """
  Returns an `%Ecto.Changeset{}` for tracking settlement changes.

  ## Examples

      iex> change_settlement(settlement)
      %Ecto.Changeset{data: %Settlement{}}

  """
  def change_settlement(%Settlement{} = settlement, attrs \\ %{}) do
    Settlement.changeset(settlement, attrs)
  end
end
