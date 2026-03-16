defmodule SuperCodes.BettingStore do
  @moduledoc """
  In-memory store for betting state.

  State shape:
    %{
      balances: %{user_id => integer},
      bets: [%{user_id: string, side: :yes | :no, amount: integer}]
    }
  """

  use GenServer

  @initial_balance 100
  @topic "betting:updates"

  # --- Public API ---

  def start_link(_opts), do: GenServer.start_link(__MODULE__, %{}, name: __MODULE__)

  def get_state, do: GenServer.call(__MODULE__, :get_state)

  def ensure_user(user_id), do: GenServer.call(__MODULE__, {:ensure_user, user_id})

  def place_bet(user_id, side, amount) when side in [:yes, :no] do
    GenServer.call(__MODULE__, {:place_bet, user_id, side, amount})
  end

  def topic, do: @topic

  # --- GenServer callbacks ---

  @impl true
  def init(_), do: {:ok, %{balances: %{}, bets: []}}

  @impl true
  def handle_call(:get_state, _from, state), do: {:reply, state, state}

  @impl true
  def handle_call({:ensure_user, user_id}, _from, state) do
    if Map.has_key?(state.balances, user_id) do
      {:reply, :ok, state}
    else
      new_state = put_in(state, [:balances, user_id], @initial_balance)
      {:reply, :ok, new_state}
    end
  end

  @impl true
  def handle_call({:place_bet, user_id, side, amount}, _from, state) do
    balance = Map.get(state.balances, user_id, @initial_balance)

    cond do
      amount <= 0 ->
        {:reply, {:error, "Amount must be greater than 0"}, state}

      amount > balance ->
        {:reply, {:error, "Insufficient balance"}, state}

      true ->
        new_state =
          state
          |> put_in([:balances, user_id], balance - amount)
          |> update_in([:bets], &[%{user_id: user_id, side: side, amount: amount} | &1])

        Phoenix.PubSub.broadcast(SuperCodes.PubSub, @topic, {:bets_updated, new_state})
        {:reply, :ok, new_state}
    end
  end
end
