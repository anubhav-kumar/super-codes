defmodule LiveBettingWeb.SettlementLive.Show do
  use LiveBettingWeb, :live_view

  alias LiveBetting.Betting

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <.header>
        Settlement {@settlement.id}
        <:subtitle>This is a settlement record from your database.</:subtitle>
        <:actions>
          <.button navigate={~p"/settlements"}>
            <.icon name="hero-arrow-left" />
          </.button>
          <.button variant="primary" navigate={~p"/settlements/#{@settlement}/edit?return_to=show"}>
            <.icon name="hero-pencil-square" /> Edit settlement
          </.button>
        </:actions>
      </.header>

      <.list>
        <:item title="Total pool">{@settlement.total_pool}</:item>
        <:item title="House cut">{@settlement.house_cut}</:item>
        <:item title="Distributable pool">{@settlement.distributable_pool}</:item>
        <:item title="Outcome">{@settlement.outcome}</:item>
        <:item title="Settled at">{@settlement.settled_at}</:item>
      </.list>
    </Layouts.app>
    """
  end

  @impl true
  def mount(%{"id" => id}, _session, socket) do
    {:ok,
     socket
     |> assign(:page_title, "Show Settlement")
     |> assign(:settlement, Betting.get_settlement!(id))}
  end
end
