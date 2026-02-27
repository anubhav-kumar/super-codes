defmodule LiveBettingWeb.WindowLive.Show do
  use LiveBettingWeb, :live_view

  alias LiveBetting.Matches

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <.header>
        Window {@window.id}
        <:subtitle>This is a window record from your database.</:subtitle>
        <:actions>
          <.button navigate={~p"/windows"}>
            <.icon name="hero-arrow-left" />
          </.button>
          <.button variant="primary" navigate={~p"/windows/#{@window}/edit?return_to=show"}>
            <.icon name="hero-pencil-square" /> Edit window
          </.button>
        </:actions>
      </.header>

      <.list>
        <:item title="Sequence number">{@window.sequence_number}</:item>
        <:item title="Opens at">{@window.opens_at}</:item>
        <:item title="Closes at">{@window.closes_at}</:item>
        <:item title="Duration seconds">{@window.duration_seconds}</:item>
        <:item title="Status">{@window.status}</:item>
        <:item title="Resolution type">{@window.resolution_type}</:item>
        <:item title="Winning team">{@window.winning_team}</:item>
        <:item title="House takeout pct">{@window.house_takeout_pct}</:item>
      </.list>
    </Layouts.app>
    """
  end

  @impl true
  def mount(%{"id" => id}, _session, socket) do
    {:ok,
     socket
     |> assign(:page_title, "Show Window")
     |> assign(:window, Matches.get_window!(id))}
  end
end
