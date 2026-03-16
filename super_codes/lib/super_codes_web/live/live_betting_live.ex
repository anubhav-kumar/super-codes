defmodule SuperCodesWeb.LiveBettingLive do
  use SuperCodesWeb, :live_view

  alias SuperCodes.BettingStore

  @userid_regex ~r/^[a-zA-Z0-9]{6}$/

  @impl true
  def mount(%{"userid" => user_id}, _session, socket) do
    if String.match?(user_id, @userid_regex) do
      BettingStore.ensure_user(user_id)

      if connected?(socket) do
        Phoenix.PubSub.subscribe(SuperCodes.PubSub, BettingStore.topic())
      end

      state = BettingStore.get_state()

      {:ok,
       socket
       |> assign(:user_id, user_id)
       |> assign(:amount, "")
       |> assign(:error, nil)
       |> assign_state(state)}
    else
      {:ok,
       socket
       |> assign(:user_id, user_id)
       |> assign(:invalid_user_id, true)}
    end
  end

  @impl true
  def handle_info({:bets_updated, state}, socket) do
    {:noreply, assign_state(socket, state)}
  end

  @impl true
  def handle_event("place_bet", _, socket) do
    user_id = socket.assigns.user_id

    # IO.inspect(amount_str, label: "Received amount string")
    IO.inspect(socket.assigns, label: "Socket assigns")

    # case Integer.parse(amount_str) |> IO.inspect(label: "Convert STR to INT") do
    #   {amount, ""} when amount > 0 ->
    #     side_atom = String.to_existing_atom(side)

    #     case BettingStore.place_bet(user_id, side_atom, amount) do
    #       :ok ->
    #         state = BettingStore.get_state()
    #         {:noreply, socket |> assign(:error, nil) |> assign(:amount, "") |> assign_state(state)}

    #       {:error, msg} ->
    #         {:noreply, assign(socket, :error, msg)}
    #     end

    #   _ ->
    #     {:noreply, assign(socket, :error, "Enter a valid positive number")}
    # end
  end

  @impl true
  def handle_event("update_amount", val, socket) do
    IO.inspect(val, label: "Amount input changed")
    {:noreply, assign(socket, :amount, val)}
  end

  # --- Helpers ---

  defp assign_state(socket, state) do
    user_id = socket.assigns[:user_id]
    balance = Map.get(state.balances, user_id, 100)
    yes_bets = Enum.filter(state.bets, &(&1.side == :yes))
    no_bets = Enum.filter(state.bets, &(&1.side == :no))
    yes_total = Enum.sum(Enum.map(yes_bets, & &1.amount))
    no_total = Enum.sum(Enum.map(no_bets, & &1.amount))

    socket
    |> assign(:balance, balance)
    |> assign(:yes_bets, yes_bets)
    |> assign(:no_bets, no_bets)
    |> assign(:yes_total, yes_total)
    |> assign(:no_total, no_total)
  end

  @impl true
  def render(assigns) do
    ~H"""
    <%= if Map.get(assigns, :invalid_user_id) do %>
      <div class="min-h-screen bg-gray-100 flex items-center justify-center">
        <div class="bg-white rounded-xl shadow p-8 text-center max-w-md">
          <h1 class="text-2xl font-bold text-red-600 mb-2">Invalid User ID</h1>
          <p class="text-gray-600">
            User ID <strong><%= @user_id %></strong> is invalid.
            Must be exactly 6 alphanumeric characters (e.g. <code>abc123</code>).
          </p>
        </div>
      </div>
    <% else %>
      <div class="min-h-screen bg-gray-50 p-6">
        <div class="max-w-3xl mx-auto space-y-6">

          <%!-- Header --%>
          <div class="bg-white rounded-xl shadow p-5 flex items-center justify-between">
            <div>
              <h1 class="text-xl font-bold text-gray-800">Live Betting</h1>
              <p class="text-sm text-gray-500">User: <span class="font-mono font-semibold text-indigo-600"><%= @user_id %></span></p>
            </div>
            <div class="text-right">
              <p class="text-sm text-gray-500">Your Balance</p>
              <p class="text-2xl font-bold text-green-600">₹<%= @balance %></p>
            </div>
          </div>

          <%!-- Totals --%>
          <div class="grid grid-cols-2 gap-4">
            <div class="bg-green-50 border border-green-200 rounded-xl p-5 text-center">
              <p class="text-sm text-green-700 font-medium uppercase tracking-wide">Total on YES</p>
              <p class="text-3xl font-bold text-green-600 mt-1">₹<%= @yes_total %></p>
            </div>
            <div class="bg-red-50 border border-red-200 rounded-xl p-5 text-center">
              <p class="text-sm text-red-700 font-medium uppercase tracking-wide">Total on NO</p>
              <p class="text-3xl font-bold text-red-600 mt-1">₹<%= @no_total %></p>
            </div>
          </div>

          <%!-- Bet Form --%>
          <div class="bg-white rounded-xl shadow p-5">
            <h2 class="text-lg font-semibold text-gray-700 mb-4">Place Your Bet</h2>
            <%= if @error do %>
              <p class="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3"><%= @error %></p>
            <% end %>
            <div class="flex gap-3 items-end">
              <div class="flex-1">
                <label class="block text-sm text-gray-600 mb-1">Amount (₹)</label>
                <input
                  type="number"
                  min="1"
                  max={@balance}
                  value={@amount}
                  phx-change="update_amount"
                  name="amount"
                  placeholder="Enter amount"
                  class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <button
                phx-click="place_bet"
                phx-value-side="yes"
                phx-value-amount={@amount}
                class="bg-green-500 hover:bg-green-600 text-white font-semibold px-5 py-2 rounded-lg transition"
              >
                Bet YES
              </button>
              <button
                phx-click="place_bet"
                phx-value-side="no"
                phx-value-amount={@amount}
                class="bg-red-500 hover:bg-red-600 text-white font-semibold px-5 py-2 rounded-lg transition"
              >
                Bet NO
              </button>
            </div>
          </div>

          <%!-- Bet Details --%>
          <div class="grid grid-cols-2 gap-4">
            <div class="bg-white rounded-xl shadow p-5">
              <h3 class="text-md font-semibold text-green-700 mb-3">YES Bets</h3>
              <%= if Enum.empty?(@yes_bets) do %>
                <p class="text-sm text-gray-400 italic">No bets yet</p>
              <% else %>
                <ul class="space-y-2">
                  <%= for bet <- @yes_bets do %>
                    <li class="flex justify-between text-sm">
                      <span class="font-mono text-gray-700"><%= bet.user_id %></span>
                      <span class="font-semibold text-green-600">₹<%= bet.amount %></span>
                    </li>
                  <% end %>
                </ul>
              <% end %>
            </div>

            <div class="bg-white rounded-xl shadow p-5">
              <h3 class="text-md font-semibold text-red-700 mb-3">NO Bets</h3>
              <%= if Enum.empty?(@no_bets) do %>
                <p class="text-sm text-gray-400 italic">No bets yet</p>
              <% else %>
                <ul class="space-y-2">
                  <%= for bet <- @no_bets do %>
                    <li class="flex justify-between text-sm">
                      <span class="font-mono text-gray-700"><%= bet.user_id %></span>
                      <span class="font-semibold text-red-600">₹<%= bet.amount %></span>
                    </li>
                  <% end %>
                </ul>
              <% end %>
            </div>
          </div>

        </div>
      </div>
    <% end %>
    """
  end
end
