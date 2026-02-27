defmodule LiveBettingWeb.BetLive.Show do
  use LiveBettingWeb, :live_view

  alias LiveBetting.Betting

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <.header>
        Bet {@bet.id}
        <:subtitle>This is a bet record from your database.</:subtitle>
        <:actions>
          <.button navigate={~p"/bets"}>
            <.icon name="hero-arrow-left" />
          </.button>
          <.button variant="primary" navigate={~p"/bets/#{@bet}/edit?return_to=show"}>
            <.icon name="hero-pencil-square" /> Edit bet
          </.button>
        </:actions>
      </.header>

      <.list>
        <:item title="Team picked">{@bet.team_picked}</:item>
        <:item title="Amount">{@bet.amount}</:item>
        <:item title="Placed at second">{@bet.placed_at_second}</:item>
        <:item title="Time weight">{@bet.time_weight}</:item>
        <:item title="Status">{@bet.status}</:item>
      </.list>
    </Layouts.app>
    """
  end

  @impl true
  def mount(%{"id" => id}, _session, socket) do
    {:ok,
     socket
     |> assign(:page_title, "Show Bet")
     |> assign(:bet, Betting.get_bet!(id))}
  end
end
