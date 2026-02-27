defmodule LiveBettingWeb.BetLive.Index do
  use LiveBettingWeb, :live_view

  alias LiveBetting.Betting

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <.header>
        Listing Bets
        <:actions>
          <.button variant="primary" navigate={~p"/bets/new"}>
            <.icon name="hero-plus" /> New Bet
          </.button>
        </:actions>
      </.header>

      <.table
        id="bets"
        rows={@streams.bets}
        row_click={fn {_id, bet} -> JS.navigate(~p"/bets/#{bet}") end}
      >
        <:col :let={{_id, bet}} label="Team picked">{bet.team_picked}</:col>
        <:col :let={{_id, bet}} label="Amount">{bet.amount}</:col>
        <:col :let={{_id, bet}} label="Placed at second">{bet.placed_at_second}</:col>
        <:col :let={{_id, bet}} label="Time weight">{bet.time_weight}</:col>
        <:col :let={{_id, bet}} label="Status">{bet.status}</:col>
        <:action :let={{_id, bet}}>
          <div class="sr-only">
            <.link navigate={~p"/bets/#{bet}"}>Show</.link>
          </div>
          <.link navigate={~p"/bets/#{bet}/edit"}>Edit</.link>
        </:action>
        <:action :let={{id, bet}}>
          <.link
            phx-click={JS.push("delete", value: %{id: bet.id}) |> hide("##{id}")}
            data-confirm="Are you sure?"
          >
            Delete
          </.link>
        </:action>
      </.table>
    </Layouts.app>
    """
  end

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     socket
     |> assign(:page_title, "Listing Bets")
     |> stream(:bets, list_bets())}
  end

  @impl true
  def handle_event("delete", %{"id" => id}, socket) do
    bet = Betting.get_bet!(id)
    {:ok, _} = Betting.delete_bet(bet)

    {:noreply, stream_delete(socket, :bets, bet)}
  end

  defp list_bets() do
    Betting.list_bets()
  end
end
