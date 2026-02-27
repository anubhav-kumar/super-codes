defmodule LiveBettingWeb.PoolLive.Show do
  use LiveBettingWeb, :live_view

  alias LiveBetting.Matches

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <.header>
        Pool {@pool.id}
        <:subtitle>This is a pool record from your database.</:subtitle>
        <:actions>
          <.button navigate={~p"/pools"}>
            <.icon name="hero-arrow-left" />
          </.button>
          <.button variant="primary" navigate={~p"/pools/#{@pool}/edit?return_to=show"}>
            <.icon name="hero-pencil-square" /> Edit pool
          </.button>
        </:actions>
      </.header>

      <.list>
        <:item title="Team">{@pool.team}</:item>
        <:item title="Total amount">{@pool.total_amount}</:item>
        <:item title="Total weight">{@pool.total_weight}</:item>
      </.list>
    </Layouts.app>
    """
  end

  @impl true
  def mount(%{"id" => id}, _session, socket) do
    {:ok,
     socket
     |> assign(:page_title, "Show Pool")
     |> assign(:pool, Matches.get_pool!(id))}
  end
end
